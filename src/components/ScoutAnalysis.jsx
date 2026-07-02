import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, pointerWithin, useDroppable, useDraggable,
} from '@dnd-kit/core';
import { createStaffAccessor } from './staffDB';
import RecruitingPlanRow from './RecruitingPlanRow';
import GemBustIcon from './GemBustIcon';
import { PROFILES, POSITIONS } from './ThresholdLookup';
import { archetypeBaseScore, normalizeArch } from './archetypeWeights';
import { isPlayerOnRoster } from '../context/DynastyContext';
import { buildRevealedPool, buildWeightsMap } from '../utils/devTraitLearning';

// Drop target for a sub-position group in the Current Roster list — the whole
// group section (header + its rows) accepts a dropped player tile.
function RosterDropArea({ id, children }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`rounded-lg transition ${isOver ? 'ring-1 ring-emerald-700/60 bg-surface-3' : ''}`}>
      {children}
    </div>
  );
}

// Draggable wrapper for a single roster row — click-hold and drag onto another
// sub-position group's section to reassign. Defined at module scope (not nested
// in the parent's render) so dnd-kit's drag identity stays stable across drags.
function RosterDraggableRow({ id, className, dimmed = false, onClick, children }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={className}
      style={{ opacity: isDragging ? 0.25 : dimmed ? 0.6 : 1, cursor: 'grab', touchAction: 'none' }}
    >
      {children}
    </div>
  );
}

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
  QB: ['QB'], HB: ['HB', 'RB'], FB: ['FB'], WR: ['WR'], TE: ['TE'],
  OT: ['LT', 'RT', 'OT'], OG: ['LG', 'RG', 'OG'], C: ['C'],
  DE: ['DE', 'LEDG', 'REDG', 'EDGE', 'LE', 'RE'],
  DT: ['DT', 'NT', 'DL'],
  OLB: ['SAM', 'WILL', 'OLB', 'LOLB', 'ROLB'],
  MIKE: ['MIKE', 'MLB', 'ILB', 'LB'],
  CB: ['CB', 'DB'], FS: ['FS'], SS: ['SS'],
  K: ['K'], P: ['P'], ATH: ['ATH'],
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

const POS_MIN_DEPTH = { QB:3, HB:4, FB:0, WR:7, TE:3, OT:6, OG:6, C:3, DE:6, DT:4, OLB:6, MIKE:3, CB:5, FS:3, SS:3, K:1, P:1, ATH:0 };
const POS_STARTERS  = { QB:1, HB:1, FB:0, WR:3, TE:1, OT:2, OG:2, C:1, DE:2, DT:2, OLB:2, MIKE:1, CB:3, FS:1, SS:1, K:1, P:1, ATH:0 };

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

// Computes the "room state" numbers (starters by year, need flags, depth tag)
// for any list of already-built player entries (see makePlayerEntry). Shared
// by the position-level roll-up AND each individual sub-position (LT/RT etc.)
// so both use identical logic, just scoped to a different player list.
function computeRoomStats(allPlayers, minStarter, minDepth, isSingleSlotPos = false) {
  const normProj = p => p.effectiveProj === 5 ? 1 : p.effectiveProj;
  const projByYr = (p, yr) => { const ep = normProj(p); return ep !== null && ep > 0 && ep <= yr; };
  const notStartingYr = (p, yr) => { const ep = normProj(p); return ep === 0 || (ep !== null && ep > yr); };
  const nextYearStarters = allPlayers.filter(p => p.yearsLeft >= 1 && !notStartingYr(p, 1) && (p.quality === 'starter' || projByYr(p, 1))).length;
  const yr2Starters      = allPlayers.filter(p => p.yearsLeft >= 2 && !notStartingYr(p, 2) && (p.quality === 'starter' || projByYr(p, 2))).length;
  const yr3Starters      = allPlayers.filter(p => p.yearsLeft >= 3 && !notStartingYr(p, 3) && (p.quality === 'starter' || projByYr(p, 3) || p.isIncoming)).length;
  const nextYearCount    = allPlayers.filter(p => p.yearsLeft >= 1).length;
  const needsPortal      = isSingleSlotPos ? nextYearCount === 0 : nextYearStarters < minStarter;
  const needsRecruit     = isSingleSlotPos ? false : (yr2Starters < minStarter || yr3Starters < minStarter);
  const seniorCount      = allPlayers.filter(p => p.isLeaving).length;
  const returningCount   = allPlayers.filter(p => !p.isIncoming && !p.isLeaving).length;
  const committedCount   = allPlayers.filter(p => p.isIncoming).length;

  const yr1Covered = nextYearStarters >= minStarter;
  const yr2Covered = yr2Starters >= minStarter;
  const depthNeeded = Math.max(1, minDepth - minStarter);
  const depthScore  = Math.max(0, yr2Starters - nextYearStarters)
                    + Math.max(0, yr3Starters - yr2Starters)
                    + Math.max(0, nextYearCount - nextYearStarters);
  const hasGoodDepth = depthScore >= depthNeeded;
  const hasAnyDepth  = depthScore >= Math.ceil(depthNeeded * 0.5);
  const hasProspect = allPlayers.some(p =>
    !p.isLeaving && p.effectiveProj === 2 &&
    (['star', 'elite'].includes((p.devTrait || '').trim().toLowerCase()))
  );
  const hasMultipleStarters = nextYearStarters >= 2;
  const depthTag = (!yr1Covered && !yr2Covered)                        ? 'Bare'
                 : (!yr1Covered || !yr2Covered || !hasAnyDepth)        ? 'Thin'
                 : (!hasGoodDepth)                                      ? 'Solid'
                 : (hasGoodDepth && hasMultipleStarters && hasProspect) ? 'Loaded'
                 :                                                        'Deep';
  return {
    nextYearStarters, yr2Starters, yr3Starters, nextYearCount,
    needsPortal, needsRecruit, seniorCount, returningCount, committedCount,
    depthTag, minStarter, isSingleSlotPos,
  };
}

const DEPTH_TAG_RANK = { Bare: 0, Thin: 1, Solid: 2, Deep: 3, Loaded: 4 };

// Lightweight per-sub-position (LT/RT etc.) headline + verdict + recruit-target
// generator — simpler than buildPositionHub's full narrative engine (which stays
// position-level, driven by the shared recruiting board), but independent per
// side: its own verdict, its own headline, its own HS/Portal target numbers.
function buildSubHub(subLabel, subPlayers, stats, recruitStrategy, extraTargets, verdictOverride, depthTagOverride) {
  const immediateNeed = stats.needsPortal;
  const pipelineNeed  = stats.needsRecruit && !immediateNeed;
  const roomRating = depthTagOverride || stats.depthTag;
  let needKey = immediateNeed ? 'critical'
    : pipelineNeed && roomRating !== 'Loaded' ? 'depth-needed'
    : pipelineNeed && roomRating === 'Loaded' ? 'extra'
    : roomRating === 'Bare' ? 'critical'
    : roomRating === 'Thin' ? 'depth-needed'
    : 'no-investment';
  if (verdictOverride) needKey = verdictOverride;
  const VERDICT_LABELS = { critical: 'Critical Need', 'depth-needed': 'Depth Needed', extra: 'Extra Investment', 'no-investment': 'No Investment' };
  const verdict = { key: needKey, label: VERDICT_LABELS[needKey], ...VERDICT_STYLES[needKey], isManual: !!verdictOverride };

  const autoStrategy = { portal: immediateNeed, hs: stats.needsRecruit };
  const stratPortal = recruitStrategy?.portal !== undefined ? recruitStrategy.portal : autoStrategy.portal;
  const stratHs     = recruitStrategy?.hs     !== undefined ? recruitStrategy.hs     : autoStrategy.hs;
  let portalMin = stratPortal ? 1 : 0;
  let hsMin     = stratHs ? 1 : 0;
  portalMin = Math.max(0, portalMin + (extraTargets?.portal ?? 0));
  hsMin     = Math.max(0, hsMin + (extraTargets?.hs ?? 0));
  let portalMax = portalMin, hsMax = hsMin;

  if (verdictOverride) {
    if (verdictOverride === 'critical') { portalMin = Math.max(portalMin, 1); portalMax = portalMin; }
    else if (verdictOverride === 'depth-needed') { hsMin = Math.max(hsMin, 1); hsMax = hsMin; portalMin = 0; portalMax = 0; }
    else if (verdictOverride === 'no-investment') { hsMin = 0; hsMax = 0; portalMin = 0; portalMax = 0; }
  }

  const lastName = n => n.split(' ').slice(1).join(' ') || n;
  const starter = subPlayers.find(p => !p.isLeaving && !p.isIncoming && p.quality === 'starter' && p.effectiveProj !== 0 && p.effectiveProj !== 2 && p.effectiveProj !== 3);
  const starName = starter ? lastName(starter.name) : null;
  let headline;
  if (needKey === 'critical') {
    headline = starName ? `${subLabel} takes a hit — no proven answer behind ${starName} for next year` : `${subLabel} is exposed — no proven starter returning next year`;
  } else if (needKey === 'depth-needed') {
    headline = starName ? `${starName} has ${subLabel} covered right now, but depth thins out in 2-3 years` : `${subLabel} is fine right now, but the pipeline needs attention`;
  } else if (stats.depthTag === 'Loaded') {
    headline = starName ? `${subLabel} is loaded — ${starName} leads a stacked room` : `${subLabel} room is loaded — talented at every level`;
  } else if (stats.depthTag === 'Deep') {
    headline = starName ? `${subLabel} is deep — ${starName} anchors real depth behind him` : `${subLabel} is in good shape with solid depth behind the starter`;
  } else {
    headline = starName ? `${subLabel} is set — ${starName} leads a solid room` : `${subLabel} is stable — no investment needed`;
  }

  return {
    label: subLabel, verdict, headline, autoStrategy,
    recruitTarget: { hsMin, hsMax, portalMin, portalMax, min: portalMin + hsMin, max: portalMax + hsMax },
  };
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

function computeScore(player, weightsMap = null) {
  const devBonus = isHiddenDev(player.devTrait) ? estimateHiddenDev(player) : getDevBonus(player.devTrait);
  const archBase = archetypeBaseScore(player, weightsMap);
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
  if (score >= 86) return { grade: 'A-', cls: 'text-emerald-400 bg-surface-3 border-emerald-800' };
  if (score >= 82) return { grade: 'B+', cls: 'text-sky-200 bg-sky-950 border-sky-600' };
  if (score >= 78) return { grade: 'B',  cls: 'text-sky-300 bg-sky-950 border-sky-700' };
  if (score >= 74) return { grade: 'B-', cls: 'text-sky-400 bg-surface-3 border-sky-800' };
  if (score >= 70) return { grade: 'C+', cls: 'text-yellow-300 bg-yellow-950 border-yellow-700' };
  if (score >= 66) return { grade: 'C',  cls: 'text-amber-300 bg-amber-950 border-amber-700' };
  if (score >= 62) return { grade: 'C-', cls: 'text-amber-400 bg-surface-3 border-amber-800' };
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
function buildRec(pos, arch, matchingPlayers, weightsMap = null) {
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
    const s = computeScore(p, weightsMap);
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
        `Nothing filed at this archetype. Here's what we're looking for to call someone a real difference-maker here:`,
        t1Data?.cond ?? `Target prospects with the defining attributes for the ${arch} archetype.`,
        t2Data ? `If we can't find that kind of talent, a solid depth piece at minimum needs: ${t2Data.k1}.` : null,
      ].filter(Boolean),
      target: t1Data ? `Benchmark: ${t1Data.k1}` : null,
      scored,
    };
  }

  if (t1.length >= 2) {
    const extra = t2.length > 0 ? ` ${names(t2)} give us solid depth behind them.` : ' No depth behind them yet, but that\'s a secondary concern.';
    return {
      type: 'elite', urgency: 'low',
      headline: `Elite depth — ${arch} is locked in`,
      paragraphs: [
        `${names(t1, 3)} ${t1.length > 1 ? 'are both real difference-makers' : 'is a real difference-maker'} at ${arch}. That's a rare pipeline — close either one and this position group is built for multiple seasons.`,
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
        `${t1[0].name} looks like the real deal at ${arch} and is our anchor for this position. Closing that commitment is the top priority here.`,
        hasDepth
          ? `${names(t2)} give us solid depth behind him — the pipeline is in good shape. One more insurance option would make this airtight.`
          : `No depth behind ${t1[0].name} yet. Add at least one backup who hits: ${t2Data?.k1}.`,
      ],
      target: !hasDepth ? `Fallback benchmark: ${t2Data?.k1}` : null,
      scored,
    };
  }

  if (t2.length >= 2) {
    return {
      type: 'ok', urgency: 'medium',
      headline: `Solid base — no real difference-maker yet`,
      paragraphs: [
        `${names(t2, 3)} ${t2.length > 1 ? 'give you' : 'gives you'} a reliable foundation at ${arch}. These are legitimate contributors, but this class is missing a true separator.`,
        `To find that separator you need: ${t1Data?.k1}. ${firstSentence(t1Data?.cond)}`,
      ],
      target: `Looking for: ${t1Data?.k1}`,
      scored,
    };
  }

  if (t2.length === 1) {
    return {
      type: 'needs-work', urgency: 'high',
      headline: `Thin at ${arch} — one player isn't depth`,
      paragraphs: [
        `${t2[0].name} is solid at ${arch} but that's all you have. One player at a position group is never enough — injuries, decommits, and competition for reps all demand a deeper board.`,
        `Target at least one more this cycle. Ideally someone who hits: ${t1Data?.k1}. At minimum, another name who hits: ${t2Data?.k1}.`,
      ],
      target: `Looking for: ${t1Data?.k1}`,
      scored,
    };
  }

  // Nobody on the board clears even the depth bar
  const names34 = names(scored, 3);
  return {
    type: 'weak', urgency: 'high',
    headline: `Below standard at ${arch} — upgrade required`,
    paragraphs: [
      `${scored.length > 0 ? `${names34} ${scored.length > 1 ? 'don\'t' : 'doesn\'t'} hit the benchmarks needed to contribute at a high level in this archetype.` : 'No meaningful prospects at this archetype.'} Right now this is depth at best.`,
      `Reallocate recruiting effort here immediately. We're looking for: ${t1Data?.k1}. ${firstSentence(t1Data?.cond)}`,
    ],
    target: `Looking for: ${t1Data?.k1}`,
    scored,
  };
}

// ── Verdict style map ─────────────────────────────────────────────────────────
// Exactly 4 states — driven only by actual roster composition + committed
// recruits (rosterContext.needsPortal / needsRecruit), never by uncommitted
// board leads. A great scouted target doesn't resolve a need until he signs.
// Critical/Depth-Needed colors match the Daily Brief's Position Status counts
// exactly (#E3242B / #FFC72C) — same two verdicts, same meaning, one palette.
const VERDICT_STYLES = {
  critical:        { head: 'text-[#E3242B]',   badge: 'bg-surface-3 border border-[#7A1F1F] text-[#E3242B]' },
  'depth-needed':  { head: 'text-[#FFC72C]',   badge: 'bg-surface-3 border border-[#8A6D1A] text-[#FFC72C]' },
  extra:           { head: 'text-emerald-300', badge: 'bg-emerald-950 border border-emerald-700 text-emerald-400' },
  'no-investment': { head: 'text-slate-400',   badge: 'bg-slate-800 border border-slate-600 text-slate-400' },
};

// Small chevron used to mark a pill as a dropdown trigger.
function ChevronDown({ className = 'w-2.5 h-2.5' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ExpandIcon({ className = 'w-3 h-3' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function CloseIcon({ className = 'w-4 h-4' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// Same warning-triangle glyph used by RecruitingPlanRow's Critical/Depth flags.
function WarningTriangle({ className = 'w-3 h-3' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

// Dropdown option list used by the manual verdict/depth-tag override pills.
function OverrideMenu({ options, current, onSelect, align = 'right' }) {
  return (
    <div className={`absolute z-30 top-full mt-1 ${align === 'right' ? 'right-0' : 'left-0'} min-w-[150px] rounded-lg border border-surface-4 bg-surface-3 shadow-2xl overflow-hidden py-1`}>
      {options.map(opt => (
        <button
          key={String(opt.value)}
          type="button"
          onClick={() => onSelect(opt.value)}
          className={`w-full text-left px-3 py-1.5 text-[10px] font-display font-bold uppercase tracking-wide transition hover:bg-surface-4 ${current === opt.value ? 'text-txt-primary bg-surface-4' : 'text-txt-secondary'}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Position hub builder ──────────────────────────────────────────────────────
function buildPositionHub(pos, posPlayers, archList, rosterCtx, availableSpots, recruitStrategy, extraTargets, calendarCtx = {}, weightsMap = null, verdictOverride = null, depthTagOverride = null) {
  const { portalOpen = true, currentWeek = 8 } = calendarCtx;
  const archStats = archList.map(arch => {
    const matches = posPlayers.filter(pl => normalizeArch(pl.archetype) === arch);
    if (!matches.length) return { arch, count: 0, bestScore: null, bestTier: null, urgency: 'empty', scored: [], t1c: 0, t2c: 0 };
    const scored = matches.map(p => { const s = computeScore(p, weightsMap); return { ...p, score: s, tier: getTier(s) }; }).sort((a, b) => b.score - a.score);
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
    .map(p => { const s = computeScore(p, weightsMap); return { ...p, score: s, tier: getTier(s) }; })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const rc            = rosterCtx;
  const immediateNeed = rc?.needsPortal  ?? false;
  const pipelineNeed  = (rc?.needsRecruit && !immediateNeed) ?? false;
  const rosterNeed    = immediateNeed || pipelineNeed;
  const hasT1        = t1Archs.length > 0;
  const hasT2        = t2Archs.length > 0;
  const hasBoard     = posPlayers.length > 0;
  const t1Names      = t1Archs.flatMap(a => a.scored.filter(s => s.tier === 0)).sort((a, b) => b.score - a.score).slice(0, 2).map(s => s.name);
  const t2Names      = t2Archs.flatMap(a => a.scored.filter(s => s.tier === 1)).sort((a, b) => b.score - a.score).slice(0, 1).map(s => s.name);

  // Board target cross-reference helpers
  const portalTargetsOnBoard = posPlayers.filter(p => p.isPortal);
  const hsTargetsOnBoard     = posPlayers.filter(p => !p.isPortal);
  const topPortal = topTargets.filter(p => p.isPortal)[0];
  const topHs     = topTargets.filter(p => !p.isPortal)[0];

  // Roster description: focus on what's RETURNING, not total headcount
  const returningCount = rc?.returningCount ?? 0;
  const depCount       = rc?.seniorCount    ?? 0;
  const rosterDesc = rc ? (() => {
    if (rc.count === 0)                          return `No ${pos}s on the roster`;
    if (returningCount === 0 && depCount > 0)    return `Losing all ${depCount} — no ${pos}s coming back after this year`;
    if (returningCount === 0)                    return `No returning ${pos}s`;
    if (depCount > 0)                            return `${returningCount} returning after ${depCount} depart`;
    return `${returningCount} returning at ${pos}`;
  })() : null;

  // verdictKey drives headline/paragraph PROSE only — it's allowed to read
  // board strength (hasT1/hasT2) for tone ("here's a name to go close"). The
  // formal need classification (badge, Overview groupings, Daily Brief) is
  // computed separately, further down, from roster + committed recruits only.
  // Critical = hole next year only. Depth Needed = 2-3 year window only. No Investment = set.
  // K/P/FB are single-slot positions — depth is never needed there, and a
  // strong-looking board name shouldn't turn "no investment" into "covered"/
  // "monitor". They're binary: Critical if the room goes empty next year
  // (which, for FB, only happens once Configure sets its starter slot to 1 —
  // otherwise needsPortal never trips), No Investment otherwise. (Same
  // single-slot check the portal/HS default logic further down uses.)
  const isSingleSlotPosForVerdict = pos === 'K' || pos === 'P' || pos === 'FB';
  let verdictKey;
  if (isSingleSlotPosForVerdict)      verdictKey = immediateNeed ? 'critical' : 'no-investment';
  else if (immediateNeed && !hasBoard) verdictKey = 'critical';
  else if (immediateNeed && hasT1)   verdictKey = 'close-target';
  else if (immediateNeed && hasT2)   verdictKey = 'keep-search';
  else if (immediateNeed)            verdictKey = 'critical';
  else if (pipelineNeed && hasT1)    verdictKey = 'covered';
  else if (pipelineNeed)             verdictKey = 'depth-needed';
  else if (hasT1)                    verdictKey = 'covered';
  else if (hasT2)                    verdictKey = 'monitor';
  else                               verdictKey = 'no-investment';

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
  // eliteStarters covers both Elite dev AND 90+ OVR for the depth-needed branch
  const eliteStarters = retStarts.filter(p => p.devTrait === 'Elite' || p.ovr >= 90);
  const eliteName1 = eliteStarters[0] ? lastName(eliteStarters[0].name) : null;
  const eliteStr = nameList(eliteStarters);
  const elitePlural = eliteStarters.length > 1;
  // Elite and Star dev traits warrant their own narrative treatment.
  // Use case-insensitive matching — data from CFB/sheets can vary in casing.
  const devT = (p) => (p.devTrait || '').trim().toLowerCase();
  // Tier 1: Elite dev trait — rarest, most dramatic narrative
  const eliteDevStarters = retStarts.filter(p => devT(p) === 'elite');
  const eliteDevName = eliteDevStarters[0] ? lastName(eliteDevStarters[0].name) : null;
  // Tier 2: 90+ OVR (but not Elite dev) — elite performer, slightly less dramatic
  const ninetyPlusStarters = retStarts.filter(p => p.ovr >= 90 && devT(p) !== 'elite');
  const ninetyPlusName = (!eliteDevName && ninetyPlusStarters[0]) ? lastName(ninetyPlusStarters[0].name) : null;
  // Tier 3: Star dev trait (not Elite, not 90+) — star-level, grounded
  const starDevStarters = retStarts.filter(p => devT(p) === 'star' && p.ovr < 90);
  const starDevName = (!eliteDevName && !ninetyPlusName && starDevStarters[0]) ? lastName(starDevStarters[0].name) : null;
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

  // Specific position label for a group of players — use their sub-position if all the same, else group pos
  const specificPos = (players) => {
    const positions = [...new Set(players.map(p => p.pos).filter(Boolean))];
    return positions.length === 1 ? positions[0] : pos;
  };

  // Deterministic phrase picker — rotates by position, roster state, AND calendar day
  const today = new Date();
  const seed = pos.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    + (rc?.returningCount ?? 0) * 7
    + (rc?.seniorCount ?? 0) * 13
    + (rc?.committedCount ?? 0) * 17
    + (rc?.starterCount ?? 0) * 5
    + today.getDate() * 3
    + today.getMonth() * 31;
  const pick = arr => arr[((seed % arr.length) + arr.length) % arr.length];

  // ── Dev-player narrative helpers ─────────────────────────────────────────────
  const yr1s = devYr1;  const yr2s = devYr2;  const yr3s = devYr3;  const raws = devNoProj;
  const n1 = yr1s.length; const n2 = yr2s.length; const n3 = yr3s.length; const nr = raws.length;
  const yr1Str = n1 ? nameList(yr1s) : null;
  const yr2Str = n2 ? nameList(yr2s) : null;
  const yr3Str = n3 ? nameList(yr3s) : null;
  const rawStr = nr ? nameList(raws) : null;
  const comPlural = commits.length > 1;
  const retPlural = retStarts.length > 1;

  // Per-tier phrase builder — pick from a large set, seeded differently per tier
  const s1 = seed + 1; const p1pick = arr => arr[((s1 % arr.length) + arr.length) % arr.length];
  const s2 = seed + 2; const p2pick = arr => arr[((s2 % arr.length) + arr.length) % arr.length];
  const s3 = seed + 3; const p3pick = arr => arr[((s3 % arr.length) + arr.length) % arr.length];
  const s4 = seed + 4; const p4pick = arr => arr[((s4 % arr.length) + arr.length) % arr.length];

  // Tier-aware dev phrase: Elite/Star/90+ players within a cohort get special callouts
  // Short tier-aware phrase for a dev cohort — one compact sentence, tier-ordered
  const buildTierPhrase = (players, timeline, fallbackArr, seedOff) => {
    if (!players.length) return null;
    const sp = arr => arr[((( seed + seedOff) % arr.length) + arr.length) % arr.length];
    const specials = players.filter(p => p.devTrait === 'Elite' || p.devTrait === 'Star' || p.ovr >= 90);
    if (!specials.length) return sp(fallbackArr);
    const regulars = players.filter(p => !specials.some(s => (s.pid || s.name) === (p.pid || p.name)));
    const descs = specials.map(p => {
      const n = lastName(p.name);
      const isE = p.devTrait === 'Elite', isS = p.devTrait === 'Star';
      if (isE) {
        return p1pick([
          `${n} looks like the real deal — he could be the guy ${timeline}`,
          `${n} has a chance to be special — watch for him to take over ${timeline}`,
          `${n} is the one I'm most excited about in this room — trending toward a starting role ${timeline}`,
        ]);
      }
      return p2pick([
        `${n}'s got real upside — keep an eye on him ${timeline}`,
        `${n} is trending up fast and could factor in ${timeline}`,
        `${n} has the look of a difference-maker ${timeline}`,
      ]);
    });
    if (regulars.length) {
      const rs = nameList(regulars);
      descs.push(`${rs} ${regulars.length === 1 ? 'is' : 'are'} in the mix too`);
    }
    return descs.join(', ');
  };

  const yr1Phrase = buildTierPhrase(yr1s, 'next year', [
    `we expect ${yr1Str} to make the jump next year — ${n1===1?'he':'they'} should be a real piece for us`,
    `look for ${yr1Str} to step up next year — ${n1===1?'he\'s':'they\'re'} been trending in the right direction`,
    `${yr1Str} ${n1===1?'is':'are'} almost there — expecting ${n1===1?'him':'them'} to contribute by next year`,
    `I'd watch ${yr1Str} closely — ${n1===1?'he\'s':'they\'re'} a year away and the trajectory is good`,
    `${yr1Str} should be a guy for us next year — ${n1===1?'he\'s':'they\'re'} been developing nicely`,
    `expect ${yr1Str} to be a real factor next year — ${n1===1?'he\'s':'they\'re'} just about ready`,
    `${yr1Str} ${n1===1?'looks':'look'} ready to step in next year — keep an eye on ${n1===1?'him':'them'}`,
  ], 1);

  const yr2Phrase = buildTierPhrase(yr2s, 'in a year or two', [
    `${yr2Str} ${n2===1?'needs':'need'} another year or two to get there, but the upside is real`,
    `give ${yr2Str} a couple years — ${n2===1?'he':'they'} could be something when ${n2===1?'he':'they'} arrives`,
    `${yr2Str} ${n2===1?'isn\'t':'aren\'t'} there yet — figure year two before ${n2===1?'he':'they'} really contributes`,
    `don't expect ${yr2Str} for another year or two — still developing but worth being patient`,
    `year two is more realistic for ${yr2Str} — ${n2===1?'he\'s':'they\'re'} still a work in progress`,
    `${yr2Str} is in the room but we're probably a couple years out before ${n2===1?'he':'they'} factor in`,
  ], 2);

  const yr3Phrase = buildTierPhrase(yr3s, 'in the 3-year window', [
    `${yr3Str} ${n3===1?'is':'are'} raw — we're probably looking at a couple more years before ${n3===1?'he\'s':'they\'re'} ready to really contribute`,
    `don't count on ${yr3Str} before year three — ${n3===1?'he\'s':'they\'re'} still figuring it out`,
    `${yr3Str} ${n3===1?'is':'are'} a longer-term project — patient with ${n3===1?'him':'them'}, but that's a year three situation`,
    `${yr3Str} adds to the room long-term but we're a few years away — year three at the earliest`,
    `we like ${yr3Str} as a project, but don't pencil ${n3===1?'him':'them'} in for a while — probably three years out`,
  ], 3);

  const rawPhrase = rawStr ? p4pick([
    `${rawStr} ${nr===1?'adds':'add'} depth to the room but ${nr===1?'doesn\'t':'don\'t'} look like ${nr===1?'a starter':'starters'} here — could be a backup option but we may need to look elsewhere for the spot`,
    `not counting on ${rawStr} to start — ${nr===1?'he\'s':'they\'re'} backup depth, good to have in the room but we should keep recruiting for the position`,
    `${rawStr} ${nr===1?'is':'are'} in the room and ${nr===1?'that\'s':'those are'} fine pieces to have — just not projecting as starters right now`,
    `${rawStr} gives us depth but honestly ${nr===1?'doesn\'t':'don\'t'} project into the starting lineup — probably need to find someone else for that role`,
    `${rawStr} ${nr===1?'is':'are'} here and ${nr===1?'he\'s':'they\'re'} not nothing — but ${nr===1?'he\'s':'they\'re'} not the answer at the starter level either`,
  ]) : null;

  // Assemble dev narrative as a natural flow
  const devPhrases = [yr1Phrase, yr2Phrase, yr3Phrase, rawPhrase].filter(Boolean);
  const devNarrative = devPhrases.length === 0 ? null
    : devPhrases.length === 1 ? devPhrases[0] + '.'
    : devPhrases.join('; ') + '.';

  // ── Helpers for building flowing p1s ─────────────────────────────────────────
  const starterLabel  = retStr ? `${retStr} ${retPlural ? 'are' : 'is'}` : null;
  const starterPos    = retStarts.length ? specificPos(retStarts) : pos;
  const retName1      = retStarts[0] ? lastName(retStarts[0].name) : null;
  const retPos1       = retStarts[0]?.pos ?? pos;
  const topDevName    = yr1s[0] ? lastName(yr1s[0].name) : yr2s[0] ? lastName(yr2s[0].name) : null;
  const topDevTimeline = yr1s[0] ? 'next year' : yr2s[0] ? 'a year or two from now' : null;

  // Tier-aware narrative for secondary (non-featured) starters: 90+Elite > 90+Star > 90+ > Elite > Star > normal
  // Compact one-liner for secondary starters, tier-ordered: 90+Elite > 90+Star > 90+ > Elite > Star > normal
  const buildSecondaryNarrative = (players, pronoun = 'him') => {
    if (!players.length) return null;
    const tierRank = p =>
      (p.ovr >= 90 && p.devTrait === 'Elite') ? 5 :
      (p.ovr >= 90 && p.devTrait === 'Star')  ? 4 :
      (p.ovr >= 90)                            ? 3 :
      (p.devTrait === 'Elite')                 ? 2 :
      (p.devTrait === 'Star')                  ? 1 : 0;
    const sorted = [...players].sort((a, b) => tierRank(b) - tierRank(a));
    const descs = sorted.map(p => {
      const n = lastName(p.name);
      const rank = tierRank(p);
      if (rank >= 4) return p1pick([`${n} is right there with him`, `${n} is just as good`, `${n}'s the real deal too`]);
      if (rank >= 2) return p2pick([`${n}'s no slouch either`, `${n} brings real talent too`, `${n} holds his own in that room`]);
      return `${n} rounds out the room`;
    });
    if (descs.length === 1) return descs[0];
    return descs.slice(0, -1).join(', ') + ', and ' + descs[descs.length - 1];
  };

  // Build a varied "covered" p1 — leads with starters, weaves devs + commits naturally
  const buildCoveredP1 = () => {
    // Build tier sets once — every block uses the same Set to compute "everyone else"
    const eliteDevSet   = new Set(eliteDevStarters.map(p => p.pid || p.name));
    const ninetyPlusSet = new Set(ninetyPlusStarters.map(p => p.pid || p.name));
    const starDevSet    = new Set(starDevStarters.map(p => p.pid || p.name));
    const topTierSet    = new Set([...eliteDevSet, ...ninetyPlusSet]);

    // Elite dev trait: rarest designation — lead with that player as the star of the room
    if (eliteDevName) {
      const featStr    = nameList(eliteDevStarters);
      const featPlural = eliteDevStarters.length > 1;
      const featPron   = featPlural ? 'them' : 'him';
      const others     = retStarts.filter(p => !eliteDevSet.has(p.pid || p.name));
      const secNarr    = buildSecondaryNarrative(others, featPron);
      const backupLine = secNarr || `the room is built around ${featStr}`;
      const eliteOptions = [
        `${featStr} ${featPlural?'are elite players':'is an elite player'} in this room. ${secNarr ? `${secNarr}.` : `${pos} is in elite hands.`}`.trim(),
        `We expect ${featStr} to ${featPlural?'lead':'be the guy'} at ${pos} — ${backupLine}.`.trim(),
        `It's ${featStr}'s room${featPlural?'':' now'}. ${secNarr ? `${secNarr}.` : `That kind of talent at ${pos} is a program-level asset.`}`.trim(),
        `${featStr} ${featPlural?'look':'looks'} like ${featPlural?'superstars':'a superstar'} in the making. ${secNarr ? `${secNarr}.` : `That level of talent at ${pos} doesn't come around often.`}`.trim(),
        `${featStr} ${featPlural?'are special':'is special'} — talent like this at ${pos} is as rare as it gets. ${secNarr ? `${secNarr}.` : ''}`.trim(),
        `${secNarr ? `${secNarr}. ` : ''}${featStr} ${featPlural?'lead':'leads'} this room — that kind of talent at ${pos}, we don't take it for granted.`.trim(),
      ].filter(Boolean);
      return eliteOptions[((seed * 7 + 3) % eliteOptions.length + eliteOptions.length) % eliteOptions.length];
    }

    // 90+ OVR (non-Elite dev): elite performer — feature ALL 90+ players together
    if (ninetyPlusName) {
      const featStr    = nameList(ninetyPlusStarters);
      const featPlural = ninetyPlusStarters.length > 1;
      const featPron   = featPlural ? 'them' : 'him';
      const others     = retStarts.filter(p => !ninetyPlusSet.has(p.pid || p.name));
      const secNarr    = buildSecondaryNarrative(others, featPron);
      const ninetyOptions = [
        `${featStr} ${featPlural?'are':'is'} one of the best at ${pos} in the country. ${secNarr ? `${secNarr}.` : `That's a real position of strength.`}`.trim(),
        `We've got ${featPlural?'stars':'a star'} in ${featStr} at ${pos}. ${secNarr ? `${secNarr}.` : `This spot is locked down.`}`.trim(),
        `${featStr} ${featPlural?'are superstars':'is a superstar'} at ${pos}. ${secNarr ? `${secNarr}.` : ''}`.trim(),
        `${featStr} ${featPlural?'are':'is'} as good as it gets at ${pos}. ${secNarr ? `${secNarr}.` : `Don't take that for granted.`}`.trim(),
        `${featStr} ${featPlural?'are the guys':'is the guy'} at ${pos} and ${featPlural?'they\'ve':'he\'s'} earned it. ${secNarr ? `${secNarr}.` : ''}`.trim(),
      ].filter(Boolean);
      return ninetyOptions[((seed * 7 + 3) % ninetyOptions.length + ninetyOptions.length) % ninetyOptions.length];
    }

    // Star dev trait: still one of the best in college football — deserves recognition
    if (starDevName) {
      const others   = retStarts.filter(p => !starDevSet.has(p.pid || p.name) && !topTierSet.has(p.pid || p.name));
      const secNarr  = buildSecondaryNarrative(others, 'him');
      const starOptions = [
        `${starDevName} is a star at ${pos} — could be one of the better players at this position in college football. ${secNarr ? `${secNarr}.` : ''}`.trim(),
        `${starDevName} is the real deal here. ${secNarr ? `${secNarr}.` : ''}`.trim(),
        `We've got a star at ${pos} in ${starDevName}. ${secNarr ? `${secNarr} — that's a good room.` : ''}`.trim(),
        `${starDevName} is a difference-maker at ${pos}. ${secNarr ? `${secNarr}.` : ''}`.trim(),
        `${starDevName} looks like the guy — potential star at ${pos}. ${secNarr ? `${secNarr}.` : ''}`.trim(),
      ].filter(Boolean);
      return starOptions[((seed * 7 + 3) % starOptions.length + starOptions.length) % starOptions.length];
    }

    // Template set — every option names all returning starters via retStr; devNarrative is a separate paragraph
    const options = [
      retStr && topDevName
        ? `${retStr} ${retPlural?'are':'is'} holding down ${starterPos} right now. ${topDevName} is pushing for time ${topDevTimeline}.`.trim()
        : retStr
        ? `${retStr} ${retPlural?'hold':'holds'} it down at ${starterPos} — exactly what we need there.`.trim()
        : null,

      retStr
        ? `${retStr} handle${retPlural?'':'s'} the ${starterPos} spot well. ${comStr ? `${comStr} ${comPlural?'add':'adds'} depth to the room.` : 'Room is deeper than it looks.'}`.trim()
        : null,

      retStr
        ? `${retStr} ${retPlural?'are':'is'} doing everything we need at ${starterPos}. ${comStr ? `${comStr} coming in adds to the future.` : `Good depth building behind ${retPlural?'them':'him'}.`}`.trim()
        : null,

      retStr
        ? `${retStr} ${retPlural?'anchor this group':'anchors this group'}. ${comStr ? `${comStr} ${comPlural?'add':'adds'} the next wave.` : 'Depth behind them is solid.'}`.trim()
        : null,

      retStr
        ? `${retStr} ${retPlural?'are the guys':'is the guy'} at ${starterPos} right now. ${comStr ? `${comStr} coming in helps the long-term picture.` : ''}`.trim()
        : null,

      `${retStr ? `${retStr} ${retPlural?'anchor':'anchors'} ${starterPos}` : (rosterDesc || `${pos} room is in good shape`)}.`.trim(),
    ].filter(Boolean);

    return options[((seed * 7 + 3) % options.length + options.length) % options.length];
  };

  // anyManual needed by the rtMin/rtMax block below — declare here
  const anyManual = recruitStrategy !== null && (recruitStrategy?.portal !== undefined || recruitStrategy?.hs !== undefined);

  // ── SIMPLIFIED 6-STEP NARRATIVE ─────────────────────────────────────────────
  // 1. Departures  2. Starter quality  3. Developers  4. Commits  5. Board  6. Plan
  let headline;
  const paragraphs = [];

  // Headline — one line that captures the current room state. A manual
  // verdictOverride/depthTagOverride (coach's final say) picks the branch
  // directly instead of the auto-computed immediateNeed/pipelineNeed/room
  // rating, so the headline never contradicts a manually-set badge/tag.
  const roomRatingNarrative = depthTagOverride || rc?.depthTag; // Loaded/Deep/Solid/Thin/Bare
  const retStar = ninetyPlusName || eliteDevName;
  if (verdictOverride ? verdictOverride === 'critical' : immediateNeed) {
    headline = depStr
      ? retStar
        ? pick([
            `${pos} takes a hit losing ${depStr} — ${retStar} anchors us but we need another starter`,
            `${pos} is critical — losing ${depStr} hurts, and ${retStar} can't carry this room alone`,
          ])
        : pick([
            `${pos} is exposed — starter gap next year and we need to address it`,
            `Losing ${depStr} leaves a real hole at ${pos} — this needs to be solved`,
            `${pos} is wide open next year after losing ${depStr}`,
            `${pos} is the most urgent gap right now — no proven starter returning`,
          ])
      : pick([
          `${pos} is thin — not enough starter-level talent heading into next year`,
          `${pos} needs reinforcement — we're short on proven starters`,
        ]);
  } else if (verdictOverride ? verdictOverride === 'depth-needed' : pipelineNeed) {
    // Depth Needed — the room is fine right now (name the starter to show
    // that), but the focus of the headline has to be the 2–3 year pipeline.
    headline = retStar
      ? pick([
          `${retStar} has ${pos} covered right now, but the pipeline thins out in 2–3 years — start building behind him`,
          `No issue at ${pos} today with ${retStar} in the room, but we need depth for the 2–3 year window`,
          `${retStar} anchors ${pos} for now — the real focus needs to be finding prospects for the years behind him`,
        ])
      : retStr
      ? pick([
          `${retStr} ${retPlural ? 'have' : 'has'} ${pos} covered right now, but depth thins out in 2–3 years — start building the pipeline`,
          `${retStr} ${retPlural ? 'are' : 'is'} fine at ${pos} today — the depth in 2–3 years is what needs attention`,
          `No immediate issue with ${retStr} at ${pos}, but the focus has to shift to prospects for the pipeline`,
        ])
      : pick([
          `${pos} depth thins out in the 2–3 year window — start building the pipeline now`,
          `No immediate ${pos} problem, but the depth situation in 2–3 years needs attention`,
          `${pos} is fine right now but we need to build behind the current group`,
        ]);
  } else if (verdictOverride === 'extra' || (!verdictOverride && roomRatingNarrative === 'Loaded')) {
    headline = eliteDevName
      ? pick([`${pos} is loaded — ${eliteDevName} leads a deep, talented room`, `${pos} room is stacked — ${eliteDevName} with real depth behind him`])
      : ninetyPlusName
      ? pick([`${pos} is set — ${ninetyPlusName} leads a loaded room`, `${pos} is locked — ${ninetyPlusName} fronts a stacked group`])
      : pick([`${pos} room is loaded — talented at all levels`, `${pos} is stacked — this is a program-level strength`]);
  } else if (!verdictOverride && roomRatingNarrative === 'Deep') {
    headline = pick([`${pos} is in good shape — solid starters with real depth behind them`, `${pos} room is deep — starters covered and a pipeline building`]);
  } else {
    // No Investment Needed — name the starter(s) and describe the room
    // behind them as strong, rather than a generic "no urgent needs" line.
    headline = eliteDevName
      ? pick([`${eliteDevName} has ${pos} locked down, and the room behind him is strong — no investment needed`, `${pos} is set — ${eliteDevName} leads a strong room from top to bottom`])
      : ninetyPlusName
      ? pick([`${ninetyPlusName} has ${pos} covered, with a strong room behind him — no investment needed`, `${pos} is in great hands with ${ninetyPlusName}, and the depth behind him holds up`])
      : starDevName
      ? pick([`${starDevName} has ${pos} handled, and the room behind him is solid — no investment needed`, `${pos} is set with ${starDevName} leading a solid group behind him`])
      : retStr
      ? pick([
          `${retStr} ${retPlural ? 'have' : 'has'} ${pos} handled, and the room behind ${retPlural ? 'them' : 'him'} is solid — no investment needed`,
          `${retStr} ${retPlural ? 'are' : 'is'} set at ${pos} with real depth behind ${retPlural ? 'them' : 'him'}`,
        ])
      : pick([`${pos} is stable — no investment required this class`, `${pos} is in decent shape — no urgent needs`]);
  }

  // Step 1 — Departures
  if (allDeps.length) {
    paragraphs.push(
      allDeps.length === 1
        ? pick([
            `Losing ${depStr} after this season.`,
            `${depStr} is gone after this year.`,
            `We lose ${depStr} after this season — that's the departure to account for.`,
          ])
        : pick([
            `We lose ${depStr} after this season.`,
            `${depStr} are gone after this year.`,
            `Losing ${depStr} this offseason.`,
          ])
    );
  }

  // Step 2 — Starter quality (reuses existing high-quality phrase builders)
  if (retStarts.length) {
    paragraphs.push(buildCoveredP1());
  } else if (!allDeps.length) {
    paragraphs.push(pick([
      `There's no proven starter in this room right now — that's the core issue.`,
      `We don't have a proven answer at ${pos} heading into next year.`,
    ]));
  } else {
    paragraphs.push(pick([
      `There's no proven starter left behind — that's the hole we're dealing with.`,
      `Nothing left in the room that can step in and start right now.`,
    ]));
  }

  // Step 3 — Developers (yr2+ only — yr1 guys are next year's answer, covered in step 2)
  const pipelineNarrative = [yr2Phrase, yr3Phrase, rawPhrase].filter(Boolean);
  if (pipelineNarrative.length) {
    paragraphs.push(pipelineNarrative.join('; ') + '.');
  }

  // Step 4 — Incoming commits
  if (commits.length) {
    const high = commits.filter(p => (p.stars || 0) >= 4);
    const rest = commits.filter(p => (p.stars || 0) < 4);
    const parts = [];
    if (high.length) {
      const hs = nameList(high);
      parts.push(pick([
        `We're bringing in ${hs} to round the room out — really excited about ${high.length > 1 ? 'them' : 'him'}.`,
        `${hs} ${high.length > 1 ? 'are' : 'is'} the future here at ${pos}.`,
        `We have ${hs} coming in too — ${high.length > 1 ? "they're" : "he was"} always a longer-term piece, keep that in mind.`,
      ]));
    }
    if (rest.length) {
      const rs = nameList(rest);
      parts.push(pick([
        `${rs} ${rest.length > 1 ? 'round' : 'rounds'} out the class — ${rest.length > 1 ? 'they look like projects' : 'a project'}, but we develop here.`,
        `${rs} ${rest.length > 1 ? 'are' : 'is'} also coming in — depth ${rest.length > 1 ? 'pieces' : 'piece'} for now, we'll see how ${rest.length > 1 ? 'they' : 'he'} develops.`,
      ]));
    }
    if (parts.length) paragraphs.push(parts.join(' '));
  }

  // Step 5 — Board targets (topHs/topPortal defined at lines above)
  if (topHs) {
    const score = topHs.score ? ` — ${Math.round(topHs.score)} composite` : '';
    paragraphs.push(pick([
      `On the recruiting side, ${topHs.name} is our best option right now${score}. He checks the boxes for this spot.`,
      `${topHs.name} leads the board at ${pos}${score} — that's the guy we want to close.`,
      `${topHs.name} is the best file we have at ${pos}${score}. He's exactly what we're looking for.`,
    ]));
  }
  if (topPortal) {
    const score = topPortal.score ? ` — ${Math.round(topPortal.score)} composite` : '';
    const fit = topPortal.tier <= 1 ? 'He fits the profile for what we need here.' : "He's a developmental option — not the immediate answer but worth monitoring.";
    paragraphs.push(pick([
      `On the portal side, ${topPortal.name} is the top name${score}. ${fit}`,
      `${topPortal.name} leads the portal board${score} — ${topPortal.tier <= 1 ? "that's a legitimate fit here" : 'still developing but worth monitoring'}.`,
    ]));
  }

  // (old verdict branches removed — 6-step narrative system handles all cases above)

  // Board × strategy vars (anyManual declared above, strat/wantsPortal/wantsHs kept for rtMin block below)
  const strat = recruitStrategy ?? {};
  const wantsPortal = strat.portal ?? false;
  const wantsHs     = strat.hs     ?? false;

  // HS messages go first when portal window isn't open (HS is the only actionable side)
  const buildHsMsg = () => {
    if (!wantsHs || (verdictKey === 'no-investment' && !anyManual)) return;
    if (hsTargetsOnBoard.length === 0) {
      const lateMsg = currentWeek >= 13
        ? pick([
            `Recruiting side is empty at ${pos}. It's late in the cycle — most guys are off the market, but let's see if we can snag a gem.`,
            `Nothing on the HS board at ${pos} and we're deep into the season. The options narrow fast from here — need to move now.`,
            `Late in the cycle with no ${pos} names filed on the recruiting side. Whatever's left on the board won't be around long.`,
          ])
        : currentWeek >= 10
        ? pick([
            `Recruiting side is empty at ${pos}. It's Week ${currentWeek}. We need to get some names on the board now or we'll have to pivot.`,
            `No freshman targets at ${pos} yet — we're in Week ${currentWeek} and this board needs to catch up fast.`,
            `HS board at ${pos} is blank and we're getting late into the season. File some reports now before the window narrows.`,
          ])
        : pick([
            `We said we want an HS recruit at ${pos} but the board is empty on the recruiting side. Need to start filing reports.`,
            `No freshman targets at ${pos} yet — if we're going HS here, the board has to catch up.`,
            `HS side is empty at ${pos}. Let's get some names in and build the board before we lose options.`,
          ]);
      paragraphs.push(lateMsg);
    } else if (topHs) {
      const score = topHs.score ? ` — ${Math.round(topHs.score)} composite` : '';
      paragraphs.push(pick([
        `${topHs.name} is the top HS name we have at ${pos}${score}. ${topHs.tier <= 1 ? 'Good fit for what this room needs.' : 'Developmental prospect — useful depth but not a solution for the 1-2 year window.'}`,
        `On the recruiting side, ${topHs.name} is our best option right now${score}. ${topHs.tier <= 1 ? 'He checks the boxes for this spot.' : "He's a project — keep looking for a higher-ceiling guy."}`,
      ]));
    }
  };

  const buildPortalMsg = () => {
    if (!wantsPortal || (verdictKey === 'no-investment' && !anyManual)) return;
    if (portalTargetsOnBoard.length === 0) {
      paragraphs.push(portalOpen ? pick([
        `We've flagged this as a portal target spot — still nothing filed on the portal side. Worth making sure we're in those conversations.`,
        `Portal is the plan here but no portal names have come in yet. Let's get something on the board.`,
        `We said we're going portal at ${pos} — no transfer targets filed yet. That needs to move.`,
      ]) : pick([
        `Portal window isn't open yet — plan is already set to target ${pos} when it opens. Nothing to file right now.`,
        `We're planning to be in the portal at ${pos} when the window opens. Board will fill in once it does.`,
        `${pos} is flagged as a portal target. Window's not open yet — keep an eye on it and be ready to move when it is.`,
      ]));
    } else if (topPortal) {
      const score = topPortal.score ? ` — ${Math.round(topPortal.score)} composite` : '';
      const tierWord = topPortal.tier === 0 ? 'elite' : topPortal.tier === 1 ? 'solid' : 'developmental';
      paragraphs.push(pick([
        `${topPortal.name} is the best portal name we have at ${pos} right now${score}. ${topPortal.tier <= 1 ? `That's a ${tierWord} option — worth a close look for this spot.` : `He's a depth piece at best, not a solution for the gap.`}`,
        `On the portal side, ${topPortal.name} is the top name${score}. ${topPortal.tier <= 1 ? 'He fits the profile for what we need here.' : "He's developmental — not the immediate answer we need."}`,
      ]));
    }
  };

  // (board target paragraphs now generated in step 5 above)

  // ── Recruit target count ─────────────────────────────────────────────────────
  const minDepth_    = POS_MIN_DEPTH[pos]  ?? 2;
  const minStarter_  = POS_STARTERS[pos]   ?? 1;
  const spots        = availableSpots ?? 20;
  const alreadyCommitted = rc?.committedCount ?? 0;
  const depthGap     = Math.max(0, minDepth_   - (rc?.returningCount ?? 0) - alreadyCommitted);
  const starterGap   = Math.max(0, minStarter_ - (rc?.nextYearStarters ?? 0));
  const pipelineAdd  = rc?.needsRecruit ? 1 : 0;
  // Base: fill the depth gap + pipeline slot, add 1 for competition when filling a gap.
  // Also ensure pipelineNeed positions show at least 1 target so Recruiting Plan
  // stays consistent with the "Depth Needed" count in Position Status.
  let rtMin = Math.max(depthGap, starterGap > 0 && !immediateNeed ? 1 : depthGap, pipelineNeed ? 1 : 0);
  let rtMax = rtMin + pipelineAdd + (depthGap > 0 ? 1 : 0);
  // Tighten when roster is nearly full — only affect HS recruit count, not portal need
  const hasHsNeed = depthGap > 0 || (pipelineAdd > 0 && !immediateNeed);
  if (spots <= 5)  { rtMin = hasHsNeed ? 1 : 0; rtMax = hasHsNeed ? 1 : 0; }
  else if (spots <= 10) { rtMax = Math.min(rtMax, hasHsNeed ? 2 : (depthGap > 0 ? 1 : 0)); }
  rtMin = Math.max(0, rtMin);
  rtMax = Math.max(rtMin, Math.min(rtMax, 5));
  // Verdict already declared this position needs nothing — don't let the raw
  // body-count gap formula above contradict that with a "budget N spots" ask.
  if (verdictKey === 'no-investment') { rtMin = 0; rtMax = 0; }

  // ── Split: portal (immediate starter gap) vs HS recruit (depth/pipeline) ─
  // K, P, and FB (once its Configure target is on) default to an HS recruit
  // when critical, not a portal target — a single open slot at these spots
  // is filled by recruiting a freshman, not raiding the portal. The user can
  // still flip this to portal manually, same as any other position.
  const isSingleSlotPos = pos === 'K' || pos === 'P' || pos === 'FB';
  const autoPortalMin = (immediateNeed && !isSingleSlotPos) ? 1 : 0;
  const autoPortalMax = (immediateNeed && !isSingleSlotPos) ? 1 : 0;
  const autoHsMin = (immediateNeed && isSingleSlotPos) ? 1 : rtMin;
  const autoHsMax = (immediateNeed && isSingleSlotPos) ? 1 : rtMax;

  // Strategy: null = no preference saved (use auto); { portal: false } = explicitly turned off
  const hasManualPortal = recruitStrategy !== null && recruitStrategy?.portal !== undefined;
  const hasManualHs     = recruitStrategy !== null && recruitStrategy?.hs     !== undefined;
  const stratPortal = hasManualPortal ? (recruitStrategy.portal ?? false) : (immediateNeed && !isSingleSlotPos);
  const stratHs     = hasManualHs     ? (recruitStrategy.hs     ?? false) : (isSingleSlotPos ? immediateNeed : (rosterNeed && !immediateNeed));
  // anyManual already declared above the cross-reference block — do not redeclare here

  // When the user manually confirms a type the system already recommended, keep that
  // type's own auto min/max (e.g. "3-5") as the baseline instead of collapsing it to a
  // flat 1 — the extra-targets stepper then adjusts up from the real recommendation.
  // Only fall back to a flat 1 when the user turns on a type the system had no count for.
  let portalMin, portalMax, hsMin, hsMax;
  if (anyManual) {
    if (stratPortal && !stratHs) {
      const baseMin = hasManualPortal ? (autoPortalMin > 0 ? autoPortalMin : 1) : Math.max(autoPortalMin + autoHsMin, rosterNeed ? 1 : 0);
      const baseMax = hasManualPortal ? (autoPortalMin > 0 ? autoPortalMax : 1) : baseMin;
      portalMin = baseMin; portalMax = baseMax;
      hsMin = 0; hsMax = 0;
    } else if (stratHs && !stratPortal) {
      const baseMin = hasManualHs ? (autoHsMin > 0 ? autoHsMin : 1) : Math.max(autoPortalMin + autoHsMin, rosterNeed ? 1 : 0);
      const baseMax = hasManualHs ? (autoHsMin > 0 ? autoHsMax : 1) : baseMin;
      portalMin = 0; portalMax = 0;
      hsMin = baseMin; hsMax = baseMax;
    } else {
      // Both selected — each type keeps its own auto range as the manual baseline
      portalMin = hasManualPortal ? (autoPortalMin > 0 ? autoPortalMin : 1) : Math.max(autoPortalMin, rosterNeed ? 1 : 0);
      portalMax = hasManualPortal ? (autoPortalMin > 0 ? autoPortalMax : 1) : portalMin;
      hsMin     = hasManualHs     ? (autoHsMin > 0 ? autoHsMin : 1)     : Math.max(autoHsMin,     rosterNeed ? 1 : 0);
      hsMax     = hasManualHs     ? (autoHsMin > 0 ? autoHsMax : 1)     : hsMin;
    }
  } else {
    portalMin = autoPortalMin; portalMax = autoPortalMax;
    hsMin = autoHsMin;        hsMax = autoHsMax;
  }

  // Pre-extra baseline — the UI stepper uses this to know how far it can
  // subtract before the resolved count would go negative.
  const hsBase = hsMin;
  const portalBase = portalMin;

  // Apply user-requested extra targets independently per bucket. Once the
  // user nudges a count away from the auto recommendation, collapse any
  // min-max spread to the single number they landed on instead of shifting
  // both ends and still showing a range.
  const extraHs     = extraTargets?.hs     ?? 0;
  const extraPortal = extraTargets?.portal ?? 0;
  const extra       = extraHs + extraPortal;
  portalMin += extraPortal;
  portalMax = extraPortal !== 0 ? portalMin : portalMax + extraPortal;
  hsMin     += extraHs;
  hsMax     = extraHs !== 0 ? hsMin : hsMax + extraHs;

  const portalLabel = portalMin > 0
    ? `${portalMin} portal target${portalMax !== 1 ? 's' : ''}`
    : null;
  // Always a single solid number — use hsMin when > 0, else fall back to 1
  // if the ceiling says any investment is reasonable. User can adjust from there.
  const hsDisplay = hsMax > 0 ? Math.max(1, hsMin) : 0;
  const hsLabel = hsDisplay === 0 ? null
    : `${hsDisplay} recruit${hsDisplay !== 1 ? 's' : ''} this class`;
  const combinedLabel = [portalLabel, hsLabel].filter(Boolean).join(' + ')
    || (rosterNeed ? 'Investment needed' : 'No investment needed');

  // ── Step 6: Recruiting plan ───────────────────────────────────────────────────
  if (immediateNeed && stratPortal && stratHs) {
    paragraphs.push(`Hit the portal first for an immediate starter at ${pos}, then bring in a freshman to build long-term depth.`);
  } else if (immediateNeed && stratPortal) {
    const hsNote = hsMin > 0 ? ` Also target ${hsMin} HS recruit${hsMin !== 1 ? 's' : ''} for future depth.` : '';
    paragraphs.push(`Hit the portal for ${portalMin || 1} immediate starter at ${pos}.${hsNote}`);
  } else if (immediateNeed && stratHs) {
    paragraphs.push(`Targeting a high school recruit at ${pos} — a high-impact recruit or someone ready to contribute immediately is the priority given the starter gap.`);
  } else if (pipelineNeed && (hsMin > 0 || portalMin > 0)) {
    const parts = [];
    if (portalMin > 0) parts.push(`${portalMin} portal target${portalMin !== 1 ? 's' : ''}`);
    if (hsMin > 0)     parts.push(`${hsMin} HS recruit${hsMin !== 1 ? 's' : ''}`);
    paragraphs.push(`Recommendation: target ${parts.join(' and ')} at ${pos} to build out the 2–3 year pipeline.`);
  } else if (!immediateNeed && !pipelineNeed && (hsMin > 0 || portalMin > 0)) {
    paragraphs.push(`No roster investment required at ${pos} this class — we're in good shape. If that spot is needed elsewhere, use it.`);
  }

  // Placeholder to satisfy old references — keep this line
  const assembledText = '';
  const unmentioned = [];
  if (false) {
    const unmLeaving = [];
    const unmCommits = unmentioned.filter(p => p.isIncoming);
    const unmDepth    = unmentioned.filter(p => !p.isLeaving && !p.isIncoming);

    // Leaving players: name once, no further elaboration beyond the departure itself.
    if (unmLeaving.length) {
      const ls = nameList(unmLeaving);
      sentences.push(pick([
        `${ls} ${unmLeaving.length > 1 ? 'are' : 'is'} leaving after this season.`,
        `Losing ${ls} after this year.`,
      ]));
    }
    // Incoming commits: tone varies with how highly regarded the prospect is.
    if (unmCommits.length) {
      const high = unmCommits.filter(p => (p.stars || 0) >= 4);
      const rest = unmCommits.filter(p => (p.stars || 0) < 4);
      if (high.length) {
        const hs = nameList(high);
        sentences.push(pick([
          `We're bringing in ${hs} to round the room out — really excited about ${high.length > 1 ? 'them' : 'him'}.`,
          `${hs} ${high.length > 1 ? 'are' : 'is'} the future here at ${pos}.`,
          `Also adding ${hs} to the room — ${high.length > 1 ? "they're" : "he's"} a name to know.`,
        ]));
      }
      if (rest.length) {
        const rs = nameList(rest);
        sentences.push(pick([
          `${rs} ${rest.length > 1 ? 'round' : 'rounds'} out the class — ${rest.length > 1 ? 'they look' : 'he looks'} like ${rest.length > 1 ? 'projects' : 'a project'}, but we develop here.`,
          `${rs} ${rest.length > 1 ? 'are' : 'is'} also coming in — depth piece${rest.length > 1 ? 's' : ''} for now, we'll see how ${rest.length > 1 ? 'they' : 'he'} develop${rest.length > 1 ? '' : 's'}.`,
        ]));
      }
    }
    // Returning depth players who didn't fit any other bucket: matter-of-fact framing.
    if (unmDepth.length) {
      const ds = nameList(unmDepth);
      sentences.push(pick([
        `${ds} ${unmDepth.length > 1 ? 'round' : 'rounds'} out the room — depth for now.`,
        `Also in the room: ${ds} — depth pieces, nothing more to add right now.`,
        `${ds} ${unmDepth.length > 1 ? 'are' : 'is'} also in the mix — not part of the plan, just depth.`,
      ]));
    }
    if (sentences.length) paragraphs.push(sentences.join(' '));
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
      const coveredPlural = coveredSubs.length > 1;
      paragraphs.push(`${coveredLabels} ${coveredPlural ? 'are' : 'is'} covered — focus the portal need specifically on ${needLabels}.`);
    } else if (needPortalSubs.length === subPositions.length) {
      const allLabels = subPositions.map(sg => sg.label).join(' and ');
      paragraphs.push(`Both ${allLabels} need a starter next year — address each side independently.`);
    }
    // Surface which sub-positions have specific departures
    const leavingSubs = subPositions.filter(sg => sg.players.some(p => p.isLeaving));
    if (leavingSubs.length > 0 && needPortalSubs.length === 0) {
      const leaveLabels = leavingSubs.map(sg => sg.label).join(' and ');
      const leavePlural = leavingSubs.length > 1;
      paragraphs.push(`${leaveLabels} ${leavePlural ? 'are' : 'is'} losing depth this cycle — keep an eye on ${leavePlural ? 'both sides' : 'that side'} specifically.`);
    }
  }

  // Reorder paragraphs: 1) Departures 2) Elite/star starters 3) Rest of room 4) Recruiting plan
  {
    const isDep   = s => /after this year|after this season|gone.*hole|Losing |losing all/i.test(s);
    const isPlan  = s => /Recommendation:|investment is required|no investment needed|no roster investment|Budget \d|portal window|recruit.*this class|Targeting both|Hit the portal|budget.*spots|asked for.*recruit|bring in.*depth and competition/i.test(s);
    const isElite = s => /leads the room|locked down|locked up|build a room around|gold standard|elite.*answer|elite.*piece/i.test(s);
    const depP   = paragraphs.filter(isDep);
    const planP  = paragraphs.filter(isPlan);
    const eliteP = paragraphs.filter(s => !isDep(s) && !isPlan(s) && isElite(s));
    const roomP  = paragraphs.filter(s => !isDep(s) && !isPlan(s) && !isElite(s));
    paragraphs.splice(0, paragraphs.length, ...depP, ...eliteP, ...roomP, ...planP);
  }

  // Surface sub-position info for UI rendering
  const subPositionSummary = subPositions?.map(sg => ({
    label: sg.label, count: sg.count, returningCount: sg.returningCount,
    nextYearStarters: sg.nextYearStarters, needsPortal: sg.needsPortal, isThin: sg.isThin,
  })) ?? null;

  // The board's #1 target at this position (Tier 0) — lets the Daily Brief
  // Recruiting Plan show the actual recruit's name instead of a generic count
  // once there's someone the analyst actually wants here.
  const topRecTarget = topTargets.find(p => p.tier === 0) || null;

  const recruitTarget = {
    min: portalMin + hsMin, max: portalMax + hsMax,
    portalMin, portalMax, hsMin, hsMax, hsBase, portalBase,
    hasPortal: portalMin > 0, hasRecruit: hsMax > 0,
    label: combinedLabel, portalLabel, hsLabel,
    tight: spots < 10,
    topTargetName: topRecTarget ? lastName(topRecTarget.name) : null,
    topTargetIsPortal: topRecTarget ? !!topRecTarget.isPortal : false,
    topTargetPid: topRecTarget ? topRecTarget.pid : null,
  };

  // HS recruiting is recommended whenever there's any roster need — even critical
  // positions benefit from HS depth alongside the portal immediate fix.
  const autoStrategy = { portal: immediateNeed, hs: rosterNeed };

  // Formal need classification — driven by roster need AND room rating.
  // Bare/Thin rooms escalate: Thin with no pipeline need → still depth-needed.
  // Loaded rooms de-escalate: pipelineNeed + Loaded → extra (room can absorb it).
  // K/P/FB are binary (Critical or No Investment only, see verdictKey above) —
  // depthNeeded's own floor of 1 means an inactive, 0-player single-slot room
  // always fails hasAnyDepth and would otherwise escalate to "Thin"/Depth
  // Needed even with nothing actually required there.
  // depthTagOverride/verdictOverride let the coach pin the room tag and/or the
  // formal verdict by hand — the coach always has final say. A depth-tag
  // override still flows through the normal formula (so it can push the
  // verdict up/down accordingly); a verdict override wins outright.
  const roomRating = depthTagOverride || rc?.depthTag; // Loaded / Deep / Solid / Thin / Bare
  let needKey = isSingleSlotPos ? (immediateNeed ? 'critical' : 'no-investment')
    : immediateNeed ? 'critical'
    : pipelineNeed && roomRating !== 'Loaded' ? 'depth-needed'
    : pipelineNeed && roomRating === 'Loaded' ? 'extra'        // depth-needed but room is Loaded → just extra investment
    : roomRating === 'Bare'   ? 'critical'                     // no formal need but room is Bare → treat as critical
    : roomRating === 'Thin'   ? 'depth-needed'                 // no formal need but Thin room → flag it
    : recruitTarget.min > 0   ? 'extra'
    : 'no-investment';
  if (verdictOverride) needKey = verdictOverride;
  const VERDICT_LABELS = { critical: 'Critical Need', 'depth-needed': 'Depth Needed', extra: 'Extra Investment', 'no-investment': 'No Investment' };
  const verdict = { key: needKey, label: VERDICT_LABELS[needKey], ...VERDICT_STYLES[needKey], isManual: !!verdictOverride };

  // A manual verdict override also resets the recruiting targets to match it,
  // so the Recruiting Plan panel stays internally consistent with the coach's call.
  if (verdictOverride) {
    if (verdictOverride === 'critical') {
      recruitTarget.portalMin = Math.max(recruitTarget.portalMin, 1);
      recruitTarget.portalMax = Math.max(recruitTarget.portalMax, recruitTarget.portalMin);
    } else if (verdictOverride === 'depth-needed') {
      recruitTarget.hsMin = Math.max(recruitTarget.hsMin, 1);
      recruitTarget.hsMax = Math.max(recruitTarget.hsMax, recruitTarget.hsMin);
      recruitTarget.portalMin = 0;
      recruitTarget.portalMax = 0;
    } else if (verdictOverride === 'no-investment') {
      recruitTarget.hsMin = 0; recruitTarget.hsMax = 0;
      recruitTarget.portalMin = 0; recruitTarget.portalMax = 0;
    }
    // 'extra' leaves whatever targets were already computed in place.
    recruitTarget.hsBase = recruitTarget.hsMin;
    recruitTarget.portalBase = recruitTarget.portalMin;
    recruitTarget.min = recruitTarget.portalMin + recruitTarget.hsMin;
    recruitTarget.max = recruitTarget.portalMax + recruitTarget.hsMax;
    recruitTarget.hasPortal = recruitTarget.portalMin > 0;
    recruitTarget.hasRecruit = recruitTarget.hsMax > 0;
  }

  // Ensure every sentence starts with a capital letter
  const capSentences = s => s.replace(/(^|[.!?]\s+)([a-z])/g, (_, pre, ch) => pre + ch.toUpperCase());
  return {
    headline: capSentences(headline),
    paragraphs: paragraphs.map(capSentences),
    archStats, topTargets, verdict, recruitTarget, autoStrategy, subPositionSummary,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ScoutAnalysis({ players = [], removedRecruits = [], onToggleBoardRemoved = null, teamColors, teamLogo, dynasty, committedRecruits = [], onBack, onOutlookReady, jumpToPos = null, resetToOverviewKey = null, actionsRef = null }) {
  const { getStaffData, saveStaffData } = createStaffAccessor(dynasty?.id ?? null);
  const navigate = useNavigate();

  // One Recruiting Plan pill (named target or generic "1 HS"/"1 Portal" slot) —
  // shared by every Recruiting Plan surface in this file (Overview's aggregate
  // panel + its expanded modal, and each position's own Recruiting Plan box).
  // Named pills get a small × that instantly removes that recruit from the
  // board (same action Actively Targeting uses). Generic pills get a × too —
  // it just decrements that target count by one instead (adjustCtx carries
  // the hub key/type/current-resolved-count needed to do that). Either way
  // every other surface (verdict, headline, target counts, Daily Brief)
  // recomputes from the same live data automatically.
  const renderTargetPill = ({ label, pid }, reactKey, isGeneric, adjustCtx) => (
    <div key={reactKey} className={`group flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-md border bg-surface-4 border-surface-4 text-txt-secondary ${isGeneric ? 'uppercase' : ''}`}>
      <span
        onClick={pid ? (e => { e.stopPropagation(); navigate(`/dynasty/${dynasty?.id}/recruiting/${dynasty?.currentTid}/${dynasty?.currentYear}?tab=staff&view=database&pid=${pid}`); }) : undefined}
        className={`flex-1 min-w-0 truncate ${pid ? 'cursor-pointer hover:text-txt-primary transition' : ''}`}
      >{label}</span>
      {pid && onToggleBoardRemoved && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onToggleBoardRemoved({ pid }); }}
          title="Remove from recruiting plan"
          className="shrink-0 rounded-sm text-txt-tertiary hover:text-red-400 hover:bg-surface-5 transition opacity-0 group-hover:opacity-100"
        >
          <CloseIcon className="w-2.5 h-2.5" />
        </button>
      )}
      {!pid && isGeneric && adjustCtx && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); adjustExtraTargets(adjustCtx.key, adjustCtx.type, -1, adjustCtx.resolved); }}
          title={`Remove one ${adjustCtx.type === 'hs' ? 'HS' : 'Portal'} target`}
          className="shrink-0 rounded-sm text-txt-tertiary hover:text-red-400 hover:bg-surface-5 transition opacity-0 group-hover:opacity-100"
        >
          <CloseIcon className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );

  const p = teamColors?.primary || '#374151';
  const onOutlookReadyRef = React.useRef(onOutlookReady);
  useEffect(() => { onOutlookReadyRef.current = onOutlookReady; });
  const [activePos, setActivePos]   = useState('QB');
  const [activeArch, setActiveArch] = useState(null); // null = hub view
  const [isOverview, setIsOverview] = useState(true);  // start on the overview
  const [analystImg, setAnalystImg]     = useState('');
  const [analystName, setAnalystName]   = useState('Data Analyst');
  const [starterOvr, setStarterOvr]       = useState({}); // pos → OVR threshold (default 80)
  const [starterTarget, setStarterTarget] = useState({}); // pos → custom minStarter count override
  const [preferredArchs, setPreferredArchs] = useState({}); // pos → arch[]
  const [leavingFlags, setLeavingFlags]         = useState({}); // pid → 'draft' | 'transfer'
  const [starterProjections, setStarterProjections] = useState({}); // pid → 0|1|2|3 (0=not a starter)
  const [athPositions, setAthPositions]         = useState({}); // pid → pos override for ATH players
  const [posRecruitStrategy, setPosRecruitStrategy] = useState({}); // pos → 'hs' | 'portal'
  const [posExtraTargets, setPosExtraTargets]     = useState({}); // pos → extra count beyond system rec
  const [strategiesLoaded, setStrategiesLoaded]   = useState(false); // true once posRecruitStrategy+posExtraTargets loaded
  const [subPosOverrides, setSubPosOverrides]     = useState({}); // pid → sub-position label ('LE'|'RE' etc)
  const [verdictOverrides, setVerdictOverrides]   = useState({}); // pos → 'critical'|'depth-needed'|'extra'|'no-investment' (manual pin; absent = auto)
  const [depthTagOverrides, setDepthTagOverrides] = useState({}); // pos → 'Bare'|'Thin'|'Solid'|'Deep'|'Loaded' (manual pin; absent = auto)
  const [showConfig, setShowConfig]             = useState(false);

  // Revealed-devTrait HS recruit pool — nudges archetype grading once enough data exists.
  const revealedPool = useMemo(() => buildRevealedPool(players), [players]);
  const weightsMap = useMemo(() => buildWeightsMap(revealedPool, players), [revealedPool, players]);
  const [activeDragId, setActiveDragId]         = useState(null); // pid currently being dragged in Current Roster

  const rosterDndSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => {
    async function load() {
      // Fire every staffDB read in parallel instead of chaining them one
      // after another — each is a separate IndexedDB round-trip, so awaiting
      // them sequentially compounded into a real, visible delay before the
      // Daily Brief could show anything. Promise.all collapses that to the
      // cost of a single round-trip.
      const [
        img, name, ovr, archs, flags, projs, athPos, strategy, extras, subPos, ord, starterTgt, verdictOv, depthTagOv,
      ] = await Promise.all([
        getStaffData('analyst_img'),
        getStaffData('analyst_name'),
        getStaffData('analysis_starter_ovr'),
        getStaffData('analysis_preferred_archs'),
        getStaffData('analysis_leaving_flags'),
        getStaffData('analysis_starter_projections'),
        getStaffData('analysis_ath_positions'),
        getStaffData('analysis_recruit_strategy'),
        getStaffData('analysis_extra_targets'),
        getStaffData('analysis_subpos_overrides'),
        getStaffData('analysis_player_order'),
        getStaffData('analysis_starter_target'),
        getStaffData('analysis_verdict_overrides'),
        getStaffData('analysis_depth_tag_overrides'),
      ]);
      if (img)   setAnalystImg(img);
      if (name)  setAnalystName(name);
      if (ovr)   try { setStarterOvr(JSON.parse(ovr)); } catch {}
      if (archs) try { setPreferredArchs(JSON.parse(archs)); } catch {}
      if (flags) try { setLeavingFlags(JSON.parse(flags)); } catch {}
      if (projs) try { setStarterProjections(JSON.parse(projs)); } catch {}
      if (athPos) try { setAthPositions(JSON.parse(athPos)); } catch {}
      if (strategy) try { setPosRecruitStrategy(JSON.parse(strategy)); } catch {}
      if (extras) try { setPosExtraTargets(JSON.parse(extras)); } catch {}
      if (subPos) try { setSubPosOverrides(JSON.parse(subPos)); } catch {}
      if (ord) try { setPlayerOrder(JSON.parse(ord)); } catch {}
      if (starterTgt) try { setStarterTarget(JSON.parse(starterTgt)); } catch {}
      if (verdictOv) try { setVerdictOverrides(JSON.parse(verdictOv)); } catch {}
      if (depthTagOv) try { setDepthTagOverrides(JSON.parse(depthTagOv)); } catch {}
      // Only now — after every override that feeds rosterContext/allHubs has
      // loaded — is it safe to let the outlook-summary effect fire. Flipping
      // this early (before subPosOverrides/starterTarget resolved) was why the
      // Daily Brief would briefly show Critical/Depth Needed flags computed
      // from default settings, then flash to the real ones a moment later.
      setStrategiesLoaded(true);
    }
    load();
  }, []);

  const toggleRecruitStrategy = async (pos, type) => {
    const hub = allHubs[pos];
    const cur = posRecruitStrategy[pos] ?? {};
    // Effective current state: explicit if saved, otherwise auto-suggestion
    const autoOn = hub?.autoStrategy?.[type] ?? false;
    const effectiveOn = cur[type] !== undefined ? cur[type] : autoOn;
    const next = { ...cur, [type]: !effectiveOn };
    // Always save so explicit false (user deselected auto) is preserved
    const updated = { ...posRecruitStrategy, [pos]: next };
    setPosRecruitStrategy(updated);
    await saveStaffData('analysis_recruit_strategy', JSON.stringify(updated));
  };

  // resolvedCurrent is the CALLER's own currently-displayed count for this
  // key+type (hub.recruitTarget.hsMin/portalMin) — passed in explicitly
  // rather than looked up via allHubs[key], since sub-positions (LT/RT etc.)
  // use a composite "OT:LT" key that allHubs (top-level positions only)
  // doesn't have an entry for. base = resolved - existing extra offset,
  // computed either way without needing that lookup.
  const adjustExtraTargets = async (key, type, delta, resolvedCurrent) => {
    const cur = posExtraTargets[key] ?? { hs: 0, portal: 0 };
    const curExtra = cur[type] ?? 0;
    const base = resolvedCurrent !== undefined ? resolvedCurrent - curExtra : 0;
    const next = { ...cur, [type]: Math.max(-base, Math.min(4, curExtra + delta)) };
    const updated = { ...posExtraTargets, [key]: next };
    if (next.hs === 0 && next.portal === 0) delete updated[key];
    setPosExtraTargets(updated);
    await saveStaffData('analysis_extra_targets', JSON.stringify(updated));
  };
  // Hand the latest adjustExtraTargets up to ScoutStaff.jsx so Daily Brief can
  // call it too — see actionsRef comment at the call site in ScoutStaff.jsx.
  if (actionsRef) actionsRef.current.adjustExtraTargets = adjustExtraTargets;

  // Manual overrides — the coach can pin a position's verdict badge and/or
  // room depth tag by hand, overriding the computed value. A dropdown menu
  // (opened from a small chevron on each pill) picks the value directly;
  // selecting "Auto" clears the override and returns to the computed value.
  const VERDICT_OPTIONS = [
    { value: null, label: 'Auto' },
    { value: 'critical', label: 'Critical Need' },
    { value: 'depth-needed', label: 'Depth Needed' },
    { value: 'extra', label: 'Extra Investment' },
    { value: 'no-investment', label: 'No Investment' },
  ];
  const setVerdictOverrideFor = async (pos, value) => {
    const updated = { ...verdictOverrides, [pos]: value };
    if (value === null) delete updated[pos];
    setVerdictOverrides(updated);
    await saveStaffData('analysis_verdict_overrides', JSON.stringify(updated));
  };

  const DEPTH_TAG_OPTIONS = [
    { value: null, label: 'Auto' },
    { value: 'Bare', label: 'Bare' },
    { value: 'Thin', label: 'Thin' },
    { value: 'Solid', label: 'Solid' },
    { value: 'Deep', label: 'Deep' },
    { value: 'Loaded', label: 'Loaded' },
  ];
  const setDepthTagOverrideFor = async (pos, value) => {
    const updated = { ...depthTagOverrides, [pos]: value };
    if (value === null) delete updated[pos];
    setDepthTagOverrides(updated);
    await saveStaffData('analysis_depth_tag_overrides', JSON.stringify(updated));
  };

  // openVerdictMenu holds the KEY of whichever verdict dropdown is open (plain
  // "OT" for a normal position, "OT:LT" / "OT:RT" for a sub-position) — not
  // just a boolean, since sub-grouped positions now have more than one verdict
  // dropdown on screen at once, each needing its own open/closed state.
  const [openVerdictMenu, setOpenVerdictMenu] = useState(null);
  const [openDepthTagMenu, setOpenDepthTagMenu] = useState(false);
  const [planExpanded, setPlanExpanded] = useState(false);
  const verdictMenuRef = React.useRef(null);
  const depthTagMenuRef = React.useRef(null);
  useEffect(() => {
    const handler = e => {
      if (verdictMenuRef.current && !verdictMenuRef.current.contains(e.target)) setOpenVerdictMenu(null);
      if (depthTagMenuRef.current && !depthTagMenuRef.current.contains(e.target)) setOpenDepthTagMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  // Close any open override menu when navigating to a different position.
  useEffect(() => { setOpenVerdictMenu(null); setOpenDepthTagMenu(false); }, [activePos]);

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

  const setProjectionDirectly = async (pid, value) => {
    const updated = { ...starterProjections };
    if (value === null) delete updated[pid]; else updated[pid] = value;
    setStarterProjections(updated);
    await saveStaffData('analysis_starter_projections', JSON.stringify(updated));
  };

  const [playerOrder, setPlayerOrder]         = useState({});

  const savePlayerOrder = async (updated) => {
    setPlayerOrder(updated);
    await saveStaffData('analysis_player_order', JSON.stringify(updated));
  };

  const reorderPlayers = (pos, sourcePid, targetPid) => {
    const cur = playerOrder[pos] ? [...playerOrder[pos]] : [];
    const without = cur.filter(p => p !== sourcePid);
    const ti = without.indexOf(targetPid);
    if (ti === -1) without.push(sourcePid);
    else without.splice(ti, 0, sourcePid);
    savePlayerOrder({ ...playerOrder, [pos]: without });
  };

  const setAthPosition = async (pid, pos) => {
    const updated = { ...athPositions, [pid]: pos };
    setAthPositions(updated);
    await saveStaffData('analysis_ath_positions', JSON.stringify(updated));
  };

  const assignSubPos = async (pid, label) => {
    const updated = { ...subPosOverrides, [pid]: label };
    setSubPosOverrides(updated);
    await saveStaffData('analysis_subpos_overrides', JSON.stringify(updated));
  };

  const onRosterDragEnd = ({ active, over }) => {
    setActiveDragId(null);
    if (!over) return;
    const overId = String(over.id);
    if (!overId.startsWith('subpos:')) return;
    assignSubPos(active.id, overId.slice('subpos:'.length));
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

    const makePlayerEntry = (pl, ovr, cls, ovrThreshold, isIncoming = false, stars = null) => {
      const naturalYl  = isIncoming ? 4 : yearsLeft(cls);
      const isSenior   = !isIncoming && naturalYl === 0;
      const leavingType = isIncoming ? null : (leavingFlags[pl.pid] || null);
      const rawPos = isIncoming ? (pl.position || '').toUpperCase()
        : (pl.positionByYear?.[year] ?? pl.positionByYear?.[String(year)] ?? pl.position ?? '').toUpperCase();
      // K/P/FB always default to assuming their current player sticks around
      // unless truly graduating — a Draft/Transfer/Cut risk flag alone is
      // speculative and never removes them from next year's count at these
      // single-slot positions, only an actual graduating senior does.
      const isSingleSlotPosHere = rawPos === 'K' || rawPos === 'P' || rawPos === 'FB';
      const yl = (isSenior || (leavingType && !isSingleSlotPosHere)) ? 0 : naturalYl;
      const quality = ovr >= ovrThreshold ? 'starter' : ovr >= 70 ? 'developing' : 'raw';
      const manualProj = starterProjections[pl.pid || pl.name];
      // Auto-project based on OVR gap + dev trait growth rate. Incoming commits
      // have no roster history to project from, so they default to a flat
      // 3-year runway (matching how they were always treated as a "Development
      // Project" by default before a manual override was set) rather than
      // showing as unprojected.
      const devGrowthRate = { Elite: 7, Star: 5, Impact: 3, Normal: 2 }[pl.devTrait || ''] ?? 2;
      const ovrGap = ovrThreshold - ovr;
      const autoProj = isIncoming ? 3
        : (quality !== 'starter' && ovrGap > 0)
        ? (yr => {
            const devTrait = pl.devTrait || '';
            if (devTrait === 'Elite' || devTrait === 'Star') return Math.min(yr, 2);
            if (devTrait === 'Impact') return Math.min(yr, 3); // Impact always contributes by yr 3
            return yr <= 3 ? yr : 0;
          })(Math.ceil(ovrGap / devGrowthRate))
        : null;
      // Manual override wins for ALL players — starters and incoming included.
      // Without this, clicking the projection button on a starter or commit has no effect.
      // K/P/FB always default to yr1 regardless of OVR/dev trait — there's no
      // real development pipeline concept at these single-slot spots.
      const effectiveProj = manualProj !== undefined ? manualProj
        : isSingleSlotPosHere ? 1
        : isIncoming ? autoProj
        : quality === 'starter' ? 1
        : autoProj;
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
        stars,
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
      const minStarter  = starterTarget[pos] ?? POS_STARTERS[pos] ?? 1;
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
        .map(cr => makePlayerEntry(cr, STAR_OVR[Number(cr.stars)] ?? 68, 'Commit', ovrThreshold, true, Number(cr.stars) || null));
      const allPlayers = [...rosterPlayers, ...incomingPlayers];
      const seniorCount    = allPlayers.filter(p => p.isLeaving).length;
      const returningCount = rosterPlayers.length - allPlayers.filter(p => !p.isIncoming && p.isLeaving).length;
      // projByYr(p, yr): player is projected to be starter-caliber by year yr
      // projValue 5 = manually placed in Superstars — treat as 1 (next-year ready) for calculations
      const normProj = p => p.effectiveProj === 5 ? 1 : p.effectiveProj;
      const projByYr = (p, yr) => { const ep = normProj(p); return ep !== null && ep > 0 && ep <= yr; };
      // Manual projection overrides quality — if a starter is set to 2YR/3YR/No Start they don't count for year 1.
      const notStartingYr = (p, yr) => { const ep = normProj(p); return ep === 0 || (ep !== null && ep > yr); };
      const nextYearStarters = allPlayers.filter(p => p.yearsLeft >= 1 && !notStartingYr(p, 1) && (p.quality === 'starter' || projByYr(p, 1))).length;
      const yr2Starters      = allPlayers.filter(p => p.yearsLeft >= 2 && !notStartingYr(p, 2) && (p.quality === 'starter' || projByYr(p, 2))).length;
      // Committed incoming recruits count as pipeline depth for yr3 window
      const yr3Starters      = allPlayers.filter(p => p.yearsLeft >= 3 && !notStartingYr(p, 3) && (p.quality === 'starter' || projByYr(p, 3) || p.isIncoming)).length;
      const nextYearCount    = allPlayers.filter(p => p.yearsLeft >= 1).length;
      // K and P (and FB once its Configure target is raised to 1) only ever need a
      // single body in the room. Judge them purely on next-year headcount — a
      // departure that leaves the room at zero — never on the generic OVR-based
      // "starter quality" bar those positions rarely clear. They should also never
      // show Depth Needed, since a second body at the position is never required.
      const isSingleSlotPos = pos === 'K' || pos === 'P' || (pos === 'FB' && minStarter >= 1);
      const needsPortal      = isSingleSlotPos ? nextYearCount === 0 : nextYearStarters < minStarter;
      const needsRecruit     = isSingleSlotPos ? false : (yr2Starters < minStarter || yr3Starters < minStarter);
      // Sub-position breakdown for positions with left/right sides — manual
      // drag-and-drop overrides (subPosOverrides) take priority over the
      // player's raw position field so the badges stay in sync with the
      // Current Roster list after a user reassigns someone's side.
      const subgroupDef = POS_SUBGROUPS[pos];
      let subPositions = null;
      if (subgroupDef) {
        const validLabels = new Set(subgroupDef.map(sg => sg.label));
        const built = subgroupDef.map(({ label, specific, minDepth: subMin, minStarter: subStart }) => {
          const subP = allPlayers.filter(p => {
            const ov = subPosOverrides[p.pid];
            return ov && validLabels.has(ov) ? ov === label : specific.has(p.pos);
          });
          if (!subP.length) return null;
          const subStats = computeRoomStats(subP, subStart, subMin, false);
          const isThin = subP.filter(p => !p.isLeaving).length < subMin;
          return { label, count: subP.length, minStarter: subStart, minDepth: subMin,
                   allPlayers: subP, players: subP, isThin, ...subStats };
        }).filter(Boolean);
        if (built.length >= 2) subPositions = built;
      }

      // Starter-caliber = OVR threshold met, but manual 2YR/3YR/No Start overrides can demote a player.
      const returningStarters = rosterPlayers.filter(p => !p.isLeaving && p.quality === 'starter' && p.effectiveProj !== 0 && p.effectiveProj !== 2 && p.effectiveProj !== 3).length;
      // Depth tag — quality-first, three-layer evaluation:
      // Layer 1: starters returning/projected for next year vs. position requirement
      // Layer 2: developer pipeline arriving in yr2
      // Layer 3: full 3-yr pipeline + incoming commits + raw body count as tiebreaker
      // Room rating — 5-word scale capturing both starter quality AND depth behind them:
      // Loaded / Deep / Solid / Thin / Bare
      const yr1Covered = nextYearStarters >= minStarter;
      const yr2Covered = yr2Starters >= minStarter;
      // Elite starters: 90+ OVR or Elite dev trait, not manually demoted, not leaving
      const hasEliteStarters = allPlayers.some(p =>
        !p.isLeaving && !p.isIncoming && p.quality === 'starter' &&
        p.effectiveProj !== 0 && p.effectiveProj !== 2 && p.effectiveProj !== 3 &&
        (p.ovr >= 90 || (p.devTrait || '').trim().toLowerCase() === 'elite')
      );
      // Depth pipeline = non-starter pieces: developers coming up + incoming + surplus starters
      const depthNeeded = Math.max(1, minDepth - minStarter);
      const depthScore  = Math.max(0, yr2Starters - nextYearStarters)   // devs arriving yr2
                        + Math.max(0, yr3Starters - yr2Starters)        // pipeline arriving yr3
                        + Math.max(0, nextYearCount - nextYearStarters); // non-starter bodies now
      const hasGoodDepth = depthScore >= depthNeeded;
      const hasAnyDepth  = depthScore >= Math.ceil(depthNeeded * 0.5);

      // Loaded requires at least 1 Prospect (effectiveProj=2 with Star/Elite dev) in addition to elite starters + depth
      const hasProspect = allPlayers.some(p =>
        !p.isLeaving && p.effectiveProj === 2 &&
        (['star', 'elite'].includes((p.devTrait || '').trim().toLowerCase()))
      );
      // Loaded: 2+ players in Superstars/Starter-Caliber (nextYearStarters ≥ 2) AND at least 1 Prospect
      const hasMultipleStarters = nextYearStarters >= 2;
      let depthTag = (!yr1Covered && !yr2Covered)                        ? 'Bare'    // starters missing AND no pipeline
                     : (!yr1Covered || !yr2Covered || !hasAnyDepth)        ? 'Thin'    // something meaningful missing
                     : (!hasGoodDepth)                                      ? 'Solid'   // starters ok, depth light
                     : (hasGoodDepth && hasMultipleStarters && hasProspect) ? 'Loaded'  // 2+ starters + depth + 1+ prospect
                     :                                                        'Deep';    // solid starters + good depth
      let rolledUpNeedsPortal  = needsPortal;
      let rolledUpNeedsRecruit = needsRecruit;
      // Once LT/RT (etc.) have independent verdicts, the group's own badge/tag
      // becomes a worst-of-two roll-up of its sub-positions, rather than a
      // separate calculation blending both sides' players together — so
      // Overview/Daily Brief still show something meaningful without forcing
      // a drill-in, and it always agrees with whichever side is actually worse.
      if (subPositions) {
        const worst = subPositions.reduce((a, b) => DEPTH_TAG_RANK[b.depthTag] < DEPTH_TAG_RANK[a.depthTag] ? b : a);
        depthTag = worst.depthTag;
        rolledUpNeedsPortal  = subPositions.some(sg => sg.needsPortal);
        rolledUpNeedsRecruit = subPositions.some(sg => sg.needsRecruit);
      }
      result[pos] = {
        count: combinedGroup.length,
        starterCount,
        returningStarters,
        developingCount,
        rawCount: group.length - starterCount - developingCount,
        isThin: group.length < minDepth,
        nextYearThin: nextYearCount < minDepth,
        depthTag,
        minStarter,
        lacksStarter: starterCount < minStarter,
        allPlayers,
        seniorCount,
        returningCount,
        committedCount: incomingPlayers.length,
        nextYearStarters,
        yr2Starters,
        yr3Starters,
        nextYearCount,
        needsPortal: rolledUpNeedsPortal,
        needsRecruit: rolledUpNeedsRecruit,
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
  }, [dynasty, starterOvr, starterTarget, leavingFlags, starterProjections, committedRecruits, athPositions, subPosOverrides]);

  const handlePosChange = pos => {
    setActivePos(pos);
    setActiveArch(null);
    setIsOverview(false);
  };

  // External deep-link — e.g. clicking a Recruiting Plan row on the Daily Brief
  // jumps straight to that position's tab here. Keyed off a fresh object each
  // time (not just the pos string) so re-clicking the same position after
  // navigating elsewhere in Program Outlook still re-triggers the jump.
  useEffect(() => {
    if (jumpToPos?.pos) handlePosChange(jumpToPos.pos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpToPos]);

  // ScoutAnalysis stays mounted (CSS-hidden) for the whole Scout Staff session,
  // so activePos/isOverview otherwise just sit wherever they were last left.
  // The plain "Program Outlook" nav button always wants Overview — bumping
  // resetToOverviewKey (see ScoutStaff.jsx) forces that regardless of the
  // last-viewed position, without affecting genuine jumpToPos deep links.
  useEffect(() => {
    if (resetToOverviewKey !== null) { setIsOverview(true); setActiveArch(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToOverviewKey]);

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

  // Portal is only open during postseason and offseason — not during regular season or CCG
  const calendarCtx = useMemo(() => {
    const phase = dynasty?.currentPhase ?? 'regular_season';
    const portalOpen = phase === 'postseason' || phase === 'offseason';
    const currentWeek = Number(dynasty?.currentWeek ?? 8);
    return { portalOpen, currentWeek };
  }, [dynasty?.currentPhase, dynasty?.currentWeek]);

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
        calendarCtx,
        weightsMap,
        verdictOverrides[pos] ?? null,
        depthTagOverrides[pos] ?? null,
      );
    });
    return result;
  }, [players, rosterContext, rosterCapacity, posRecruitStrategy, posExtraTargets, calendarCtx, weightsMap, verdictOverrides, depthTagOverrides]);

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
        topTargetName: hub.recruitTarget?.topTargetName ?? null,
        topTargetIsPortal: hub.recruitTarget?.topTargetIsPortal ?? false,
        topTargetPid: hub.recruitTarget?.topTargetPid ?? null,
        subPositionSummary: hub.subPositionSummary ?? null,
      };
    });
    // Overall roster capacity — the SAME numbers behind Program Outlook's own
    // "X / 85 Projected Roster" bar, so the Daily Brief can't drift from it by
    // computing its own separate (and different) roster count.
    summary._rosterCapacity = { returning: rosterCapacity.returning, committed: rosterCapacity.committed };
    // Only fire once posRecruitStrategy + posExtraTargets are fully loaded from
    // staffDB — prevents the Daily Brief from briefly showing wrong target counts
    // while those async loads are still in flight.
    if (!strategiesLoaded) return;
    saveStaffData('analysis_outlook_summary', JSON.stringify(summary));
    // Also cache synchronously (localStorage) so the Daily Brief can seed
    // itself instantly on the next mount instead of showing empty while this
    // effect's async staffDB-backed inputs reload — this summary is only ever
    // written after strategiesLoaded, so the cache is always correct.
    if (dynasty?.id) {
      try { localStorage.setItem(`cfb_outlook_summary_${dynasty.id}`, JSON.stringify(summary)); } catch {}
    }
    if (onOutlookReadyRef.current) onOutlookReadyRef.current(summary);
  }, [allHubs, rosterCapacity, strategiesLoaded, dynasty?.id]);

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

  // Same position filter, applied to the recruits removed from the Big Board —
  // feeds the "Removed" section beneath Actively Targeting so it mirrors the
  // Targets tab's own Big Board/Removed split for this position.
  const posRemovedPlayers = removedRecruits.filter(pl => {
    if (pl.position === activePos) return true;
    if (pl.position === 'ATH') {
      const override = athPositions[pl.pid || pl.name];
      return override ? override === activePos : ATH_ARCH_TO_POS[pl.archetype || ''] === activePos;
    }
    return false;
  });

  // Hub data (always computed)
  const hub = buildPositionHub(activePos, posPlayers, archList, rosterContext[activePos], rosterCapacity.available, posRecruitStrategy[activePos] ?? null, posExtraTargets[activePos] ?? 0, calendarCtx, weightsMap, verdictOverrides[activePos] ?? null, depthTagOverrides[activePos] ?? null);

  // Archetype-specific data (only when an arch is selected)
  const matching = activeArch
    ? players.filter(pl => pl.position === activePos && normalizeArch(pl.archetype) === activeArch)
    : [];
  const rec = activeArch ? buildRec(activePos, activeArch, matching, weightsMap) : null;
  const urgencyBadge = rec ? URGENCY_UI[rec.urgency] : null;
  const tierCounts = rec ? [0,1,2,3].map(ti => rec.scored?.filter(s => s.tier === ti).length ?? 0) : [];

  return (
    <div className="space-y-4">

      {/* Header strip */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-surface-2 border border-surface-4">
        <h2 className="text-sm font-display font-bold uppercase text-txt-primary">Program Outlook</h2>
        <div className="flex items-center gap-3 flex-shrink-0">
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
            <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-display font-bold uppercase text-txt-secondary hover:text-txt-primary transition px-3 py-1.5 rounded-lg border border-surface-4 hover:bg-surface-3">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><polyline points="15 18 9 12 15 6"/></svg>
              Main Hub
            </button>
          )}
        </div>
      </div>

      {/* Portrait + Info row */}
      <div className="flex flex-col sm:flex-row gap-4 items-stretch">
        {/* Analyst portrait card */}
        <div className="relative rounded-xl overflow-hidden w-full h-32 sm:w-[110px] sm:h-[100px] sm:flex-shrink-0">
          {analystImg
            ? <img src={analystImg} alt="" className="absolute inset-0 w-full h-full object-cover object-top" />
            : <div className="absolute inset-0 bg-surface-3" />
          }
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 82%, rgba(0,0,0,0.85) 90%, rgba(0,0,0,0.95) 100%)' }} />
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, transparent 85%, #34d39955 100%)' }} />
          <p className="absolute top-2 right-2 text-[5px] font-semibold tracking-wider leading-snug pointer-events-none" style={{ color: '#34d399', textShadow: '0 1px 8px rgba(0,0,0,1)' }}>DATA ANALYST</p>
          <div className="absolute bottom-0 left-0 right-0 p-2.5 pointer-events-none">
            <div className="w-6 h-0.5 mb-1 rounded-full" style={{ background: '#34d399' }} />
            {(() => {
              const parts = analystName.trim().split(/\s+/);
              const fn = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
              const ln = parts[parts.length - 1];
              return <>
                {fn && <p className="text-[6px] font-semibold leading-none" style={{ color: 'rgba(255,255,255,0.75)', textShadow: '0 1px 8px rgba(0,0,0,1)' }}>{fn}</p>}
                <p className="text-xs font-bold leading-tight" style={{ color: 'white', textShadow: '0 1px 8px rgba(0,0,0,1)' }}>{ln}</p>
              </>;
            })()}
          </div>
        </div>

        {/* Info card */}
        <div className="flex-1 rounded-xl p-3 flex flex-col justify-center gap-1.5 bg-surface-2 border border-surface-4 sm:h-[100px]">
          <p className="text-base font-semibold text-txt-primary">Roster Management</p>
          <p className="text-xs text-txt-tertiary leading-snug">A full breakdown of roster needs by position — track departures, commits, and recruiting targets, and see where the program needs the most attention this cycle.</p>
        </div>
      </div>

      {/* Main panel */}
      <div className="rounded-xl overflow-hidden flex flex-col md:flex-row min-h-[560px] bg-surface-2 border border-surface-4">

        {/* Position nav */}
        <div className="w-full md:w-28 bg-surface-3 border-b md:border-b-0 md:border-r border-surface-4 p-2 flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-x-visible scrollbar-none shrink-0">
          <button
            onClick={() => { setIsOverview(true); setActiveArch(null); }}
            className={`text-[11px] font-display font-black uppercase tracking-wide px-2 py-2 rounded-lg transition shrink-0 text-center ${
              isOverview
                ? 'bg-surface-4 text-txt-primary'
                : 'text-txt-tertiary hover:bg-surface-4 hover:text-txt-primary'
            }`}
          >
            Overview
          </button>
          <div className="w-full h-px bg-surface-4 shrink-0 md:block hidden" />
          {POSITIONS.map(pos => {
            const posCount = players.filter(pl => pl.position === pos).length;
            const hasT1    = players.some(pl => pl.position === pos && getTier(computeScore(pl, weightsMap)) === 0);
            const posHub   = allHubs[pos];
            // Any immediate (next-year) roster hole reads as critical, whether or not
            // there's already a strong target on the board to close it with.
            const isCritical    = posHub?.verdict?.key === 'critical' || !!rosterContext[pos]?.needsPortal;
            const isDepthNeeded = !isCritical && posHub?.verdict?.key === 'depth-needed';
            const planTotal = (posHub?.recruitTarget?.hsMin ?? 0) + (posHub?.recruitTarget?.portalMin ?? 0);
            return (
              <button
                key={pos}
                onClick={() => handlePosChange(pos)}
                className={`relative text-[11px] font-display font-black uppercase tracking-wide px-2 py-2 rounded-lg transition shrink-0 text-center ${
                  !isOverview && activePos === pos
                    ? 'bg-surface-4 text-txt-primary'
                    : 'text-txt-tertiary hover:bg-surface-4 hover:text-txt-primary'
                }`}
              >
                {pos}
                {isCritical && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500" />
                )}
                {!isCritical && isDepthNeeded && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-yellow-400" />
                )}
                {!isCritical && !isDepthNeeded && planTotal > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400" />
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

              {/* Starter Target Count */}
              <div className="rounded-xl border border-surface-4 bg-surface-3 p-4 space-y-3">
                <div>
                  <p className="text-[9px] font-display font-black uppercase tracking-[0.12em] text-txt-secondary">Starters Needed Per Position</p>
                  <p className="text-[9px] text-txt-tertiary mt-0.5 leading-snug">How many starter-caliber players you want at each position. Drives Critical Need and Depth Needed thresholds.</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {POSITIONS.filter(p => p !== 'ATH').map(pos => {
                    const current = starterTarget[pos] ?? POS_STARTERS[pos] ?? 1;
                    const isCustom = starterTarget[pos] !== undefined;
                    const set = async (val) => {
                      const n = Math.max(1, Math.min(5, val));
                      const updated = { ...starterTarget, [pos]: n };
                      setStarterTarget(updated);
                      await saveStaffData('analysis_starter_target', JSON.stringify(updated));
                    };
                    return (
                      <div key={pos} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${isCustom ? 'bg-surface-3 border-surface-4' : 'bg-surface-2 border-surface-4'}`}>
                        <span className="text-[10px] font-black uppercase text-txt-secondary w-8 shrink-0">{pos}</span>
                        <button onClick={() => set(current - 1)} className="w-5 h-5 flex items-center justify-center rounded border border-slate-700 text-slate-400 text-xs font-black hover:border-slate-500 disabled:opacity-30 transition" disabled={current <= 1}>−</button>
                        <span className={`text-[11px] font-black w-4 text-center tabular-nums ${isCustom ? 'text-emerald-400' : 'text-txt-primary'}`}>{current}</span>
                        <button onClick={() => set(current + 1)} className="w-5 h-5 flex items-center justify-center rounded border border-slate-700 text-slate-400 text-xs font-black hover:border-slate-500 disabled:opacity-30 transition" disabled={current >= 5}>+</button>
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={async () => { setStarterTarget({}); await saveStaffData('analysis_starter_target', '{}'); }}
                  className="text-[9px] text-txt-tertiary hover:text-txt-secondary transition underline"
                >
                  Reset all to defaults
                </button>
              </div>

              {/* ATH Position Assignments now live on the ATH tab itself (see the
                  dedicated ATH view below) — covers roster AND board recruits/
                  targets in one place instead of just roster players here. */}
            </div>
          )}

          {/* ── OVERVIEW PANEL ── */}
          {!showConfig && isOverview && (() => {
            const positions = POSITIONS.filter(p => p !== 'ATH');
            const criticals    = positions.filter(p => allHubs[p]?.verdict?.key === 'critical');
            const depthNeeded  = positions.filter(p => allHubs[p]?.verdict?.key === 'depth-needed');
            const totalPortalMax = positions.reduce((s, p) => s + (allHubs[p]?.recruitTarget?.portalMax ?? 0), 0);
            const totalHsMax     = positions.reduce((s, p) => s + (allHubs[p]?.recruitTarget?.hsMax ?? 0), 0);
            const totalMax = totalPortalMax + totalHsMax;
            const { available, returning, leaving } = rosterCapacity;

            return (
              <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 overflow-y-auto divide-y divide-surface-4">

                {/* Class size summary strip */}
                <div className="px-5 py-3 flex items-center justify-between gap-4 flex-wrap bg-surface-3">
                  <div className="flex items-center gap-5 flex-wrap text-[11px] font-display font-black uppercase tracking-wide">
                    {criticals.length > 0 && <span className="text-[#E3242B]">{criticals.length} Critical</span>}
                    {depthNeeded.length > 0 && <span className="text-[#FFC72C]">{depthNeeded.length} Depth Needed</span>}
                    {criticals.length === 0 && depthNeeded.length === 0 && (
                      <span className="text-emerald-400">All Positions Covered</span>
                    )}
                  </div>
                </div>

                <div className="p-4 space-y-5">

                {/* Critical needs */}
                {criticals.length > 0 && (
                  <div className="space-y-2">
                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase px-2.5 py-1 rounded-md ${VERDICT_STYLES.critical.badge}`}><WarningTriangle className="w-3 h-3" />Critical Need</span>
                    {criticals.map(pos => {
                      const h  = allHubs[pos];
                      return (
                        <button key={pos} onClick={() => handlePosChange(pos)}
                          className="w-full text-left rounded-xl border border-surface-4 bg-surface-3 overflow-hidden hover:bg-surface-4 transition">
                          <div className="px-4 py-2.5 border-b border-surface-4 flex items-center justify-between gap-3">
                            <span className="text-sm font-display font-black uppercase tracking-wide text-[#E3242B]">{pos}</span>
                            <div className="flex items-center gap-1.5">
                              {(h.recruitTarget?.portalMin ?? 0) > 0 && <span className="text-[10px] font-display font-black uppercase px-2.5 py-1 rounded-md bg-surface-4 border border-surface-4 text-txt-secondary">{h.recruitTarget.portalMin} Portal</span>}
                              {(h.recruitTarget?.hsMin ?? 0) > 0 && <span className="text-[10px] font-display font-black uppercase px-2.5 py-1 rounded-md bg-surface-4 border border-surface-4 text-txt-secondary">{h.recruitTarget.hsMin} HS</span>}
                            </div>
                          </div>
                          <div className="px-4 py-2.5">
                            <p className="text-xs font-display font-bold uppercase text-txt-primary leading-snug">{h.headline}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Depth Needed */}
                {depthNeeded.length > 0 && (
                  <div className="space-y-2">
                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase px-2.5 py-1 rounded-md ${VERDICT_STYLES['depth-needed'].badge}`}><WarningTriangle className="w-3 h-3" />Depth Needed · 2–3 Years</span>
                    {depthNeeded.map(pos => {
                      const h = allHubs[pos];
                      return (
                        <button key={pos} onClick={() => handlePosChange(pos)}
                          className="w-full text-left rounded-xl border border-surface-4 bg-surface-3 overflow-hidden hover:bg-surface-4 transition">
                          <div className="px-4 py-2.5 border-b border-surface-4 flex items-center justify-between gap-3">
                            <span className="text-sm font-display font-black uppercase tracking-wide text-[#FFC72C]">{pos}</span>
                            <div className="flex items-center gap-1.5">
                              {(h.recruitTarget?.portalMin ?? 0) > 0 && <span className="text-[10px] font-display font-black uppercase px-2.5 py-1 rounded-md bg-surface-4 border border-surface-4 text-txt-secondary">{h.recruitTarget.portalMin} Portal</span>}
                              {(h.recruitTarget?.hsMin ?? 0) > 0 && <span className="text-[10px] font-display font-black uppercase px-2.5 py-1 rounded-md bg-surface-4 border border-surface-4 text-txt-secondary">{h.recruitTarget.hsMin} HS</span>}
                            </div>
                          </div>
                          <div className="px-4 py-2.5">
                            <p className="text-xs font-display font-bold uppercase text-txt-primary leading-snug">{h.headline}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}


                </div>
              </div>

              {/* Right: aggregate Recruiting Plan across every position that needs investment */}
              {(() => {
                const needPositions = positions.filter(pos => (allHubs[pos]?.recruitTarget?.hsMin ?? 0) > 0 || (allHubs[pos]?.recruitTarget?.portalMin ?? 0) > 0);
                const totalHs     = needPositions.reduce((s, pos) => s + (allHubs[pos]?.recruitTarget?.hsMin ?? 0), 0);
                const totalPortal = needPositions.reduce((s, pos) => s + (allHubs[pos]?.recruitTarget?.portalMin ?? 0), 0);
                // Same Offense/Defense/Special Teams split the Daily Brief's Recruiting Plan uses.
                const OFF_POS = new Set(['QB','HB','FB','WR','TE','OT','OG','C']);
                const DEF_POS = new Set(['DE','DT','OLB','MIKE','CB','FS','SS']);
                const offPositions = needPositions.filter(pos => OFF_POS.has(pos));
                const defPositions = needPositions.filter(pos => DEF_POS.has(pos));
                const stPositions  = needPositions.filter(pos => !OFF_POS.has(pos) && !DEF_POS.has(pos));
                const currentRoster = returning + (rosterCapacity.committed ?? 0);
                const projRoster = currentRoster + totalHs + totalPortal;

                const renderPosCard = pos => {
                  const h = allHubs[pos];
                  const planHs = h.recruitTarget?.hsMin ?? 0;
                  const planPortal = h.recruitTarget?.portalMin ?? 0;
                  const topName = h.recruitTarget?.topTargetName;
                  const topPortal = h.recruitTarget?.topTargetIsPortal;
                  const topPid = h.recruitTarget?.topTargetPid;
                  const hsPills = [];
                  if (planHs > 0) {
                    const named = topName && !topPortal;
                    if (named) hsPills.push({ label: topName, pid: topPid });
                    for (let i = 0; i < (named ? planHs - 1 : planHs); i++) hsPills.push({ label: '1 HS', pid: null });
                  }
                  const portalPills = [];
                  if (planPortal > 0) {
                    const named = topName && topPortal;
                    if (named) portalPills.push({ label: topName, pid: topPid });
                    for (let i = 0; i < (named ? planPortal - 1 : planPortal); i++) portalPills.push({ label: '1 Portal', pid: null });
                  }
                  const posColor = h.verdict.key === 'critical' ? 'text-[#E3242B]' : h.verdict.key === 'depth-needed' ? 'text-[#FFC72C]' : 'text-txt-secondary';
                  return (
                    <div key={pos} className="space-y-1.5">
                      <p className={`text-sm font-display font-black tracking-wide ${posColor}`}>{pos}</p>
                      {hsPills.map((pillData, i) => renderTargetPill(pillData, `hs-${i}`, pillData.label === '1 HS', { key: pos, type: 'hs', resolved: planHs }))}
                      {portalPills.map((pillData, i) => renderTargetPill(pillData, `p-${i}`, pillData.label === '1 Portal', { key: pos, type: 'portal', resolved: planPortal }))}
                    </div>
                  );
                };

                // One Offense/Defense/Special Teams column for the narrow sidebar list.
                const renderGroupList = (label, posList) => posList.length ? (
                  <div className="space-y-3">
                    <p className="text-[8px] font-display font-black uppercase tracking-[0.12em] text-slate-600">{label}</p>
                    {posList.map(pos => renderPosCard(pos))}
                  </div>
                ) : null;

                // One Offense/Defense/Special Teams section for the wide expanded grid.
                const renderGroupGrid = (label, posList) => posList.length ? (
                  <div>
                    <p className="text-xs font-display font-black uppercase tracking-[0.12em] text-slate-500 mb-3 pb-2 border-b border-surface-4">{label}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-6 gap-y-5">
                      {posList.map(pos => renderPosCard(pos))}
                    </div>
                  </div>
                ) : null;

                const totalsRow = (
                  <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                    {totalHs > 0 && (
                      <div>
                        <p className="text-[20px] font-black leading-none text-txt-primary">{totalHs}</p>
                        <p className="text-[8px] font-bold uppercase tracking-widest text-txt-tertiary mt-0.5 whitespace-nowrap">HS Targets</p>
                      </div>
                    )}
                    {totalPortal > 0 && (
                      <div>
                        <p className="text-[20px] font-black leading-none text-txt-primary">{totalPortal}</p>
                        <p className="text-[8px] font-bold uppercase tracking-widest text-txt-tertiary mt-0.5 whitespace-nowrap">Portal</p>
                      </div>
                    )}
                    <div>
                      <p className="text-[20px] font-black leading-none text-slate-400">{totalHs + totalPortal}</p>
                      <p className="text-[8px] font-bold uppercase tracking-widest text-slate-500 mt-0.5 whitespace-nowrap">Total</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-[20px] font-black leading-none ${(returning + (rosterCapacity.committed ?? 0) + totalHs + totalPortal) > 85 ? 'text-red-400' : 'text-slate-400'}`}>
                        {returning + (rosterCapacity.committed ?? 0) + totalHs + totalPortal}<span className="text-[13px] text-slate-600">/85</span>
                      </p>
                      <p className="text-[8px] font-bold uppercase tracking-widest text-slate-500 mt-0.5 whitespace-nowrap">Proj. Roster</p>
                    </div>
                  </div>
                );

                return (
                  <>
                  <div className="w-72 shrink-0 border-l border-surface-4 overflow-y-auto p-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[8px] font-display font-black uppercase tracking-[0.12em] text-txt-tertiary">Recruiting Plan</p>
                      {totalMax > 0 && (
                        <button
                          type="button"
                          onClick={() => setPlanExpanded(true)}
                          title="Expand Recruiting Plan"
                          className="p-1 -m-1 rounded text-txt-tertiary hover:text-txt-primary hover:bg-surface-4 transition"
                        >
                          <ExpandIcon className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {totalMax === 0 ? (
                      <p className="text-[10px] font-display text-txt-tertiary">No investment needed</p>
                    ) : (
                      <>
                      {totalsRow}
                      <div className="space-y-4">
                        {renderGroupList('Offense', offPositions)}
                        {renderGroupList('Defense', defPositions)}
                        {renderGroupList('Special Teams', stPositions)}
                      </div>
                      </>
                    )}
                  </div>

                  {planExpanded && (
                    <div
                      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
                      style={{ margin: 0 }}
                      onClick={() => setPlanExpanded(false)}
                    >
                      <div
                        className="relative bg-surface-2 border border-surface-4 rounded-xl w-full max-w-6xl max-h-[90vh] overflow-y-auto overflow-x-hidden p-6"
                        onClick={e => e.stopPropagation()}
                      >
                        {teamLogo && (
                          <img src={teamLogo} alt="" className="absolute inset-0 w-full h-full object-contain p-10 opacity-[0.05] pointer-events-none select-none" />
                        )}
                        {/* Centered summary stack — the "/" in each roster fraction, and
                            Portal's number, all share the exact same center X as the
                            "Recruiting Plan" title via equal-width grid columns on either
                            side of each, regardless of how wide each number/label is. */}
                        <div className="relative mb-8">
                          <button
                            type="button"
                            onClick={() => setPlanExpanded(false)}
                            title="Close"
                            className="absolute top-0 right-0 p-1.5 rounded text-txt-tertiary hover:text-txt-primary hover:bg-surface-4 transition"
                          >
                            <CloseIcon className="w-4 h-4" />
                          </button>
                          <div className="flex flex-col items-center text-center gap-5">
                            {dynasty?.currentYear && (
                              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-600">{dynasty.currentYear}</p>
                            )}
                            <p className="text-sm font-display font-black uppercase tracking-[0.12em] text-txt-tertiary">Recruiting Plan</p>
                            <div className="flex flex-col items-center">
                              <div className="inline-grid grid-cols-2">
                                <span className="text-[20px] font-black leading-none text-slate-400 text-right">{currentRoster}</span>
                                <span className="text-[20px] font-black leading-none text-left"><span className="text-slate-600">/85</span></span>
                              </div>
                              <p className="text-[8px] font-bold uppercase tracking-widest text-slate-500 mt-0.5">Current Roster</p>
                            </div>
                            <div className="w-80 grid grid-cols-[1fr_auto_1fr] items-end">
                              <div className="text-center">
                                {totalHs > 0 && (
                                  <>
                                    <p className="text-[20px] font-black leading-none text-txt-primary">{totalHs}</p>
                                    <p className="text-[8px] font-bold uppercase tracking-widest text-txt-tertiary mt-0.5">HS Targets</p>
                                  </>
                                )}
                              </div>
                              <div className="text-center px-6">
                                {totalPortal > 0 && (
                                  <>
                                    <p className="text-[20px] font-black leading-none text-txt-primary">{totalPortal}</p>
                                    <p className="text-[8px] font-bold uppercase tracking-widest text-txt-tertiary mt-0.5">Portal</p>
                                  </>
                                )}
                              </div>
                              <div className="text-center">
                                <p className="text-[20px] font-black leading-none text-slate-400">{totalHs + totalPortal}</p>
                                <p className="text-[8px] font-bold uppercase tracking-widest text-slate-500 mt-0.5">Total</p>
                              </div>
                            </div>
                            <div className="flex flex-col items-center">
                              <div className="inline-grid grid-cols-2">
                                <span className={`text-[20px] font-black leading-none text-right ${projRoster > 85 ? 'text-red-400' : 'text-slate-400'}`}>{projRoster}</span>
                                <span className={`text-[20px] font-black leading-none text-left ${projRoster > 85 ? 'text-red-400' : 'text-slate-400'}`}><span className="text-slate-600">/85</span></span>
                              </div>
                              <p className="text-[8px] font-bold uppercase tracking-widest text-slate-500 mt-0.5">Proj. Roster</p>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-6">
                          {renderGroupGrid('Offense', offPositions)}
                          {renderGroupGrid('Defense', defPositions)}
                          {renderGroupGrid('Special Teams', stPositions)}
                        </div>
                      </div>
                    </div>
                  )}
                  </>
                );
              })()}

              </div>
            );
          })()}

          {/* ── ATH VIEW — not a real recruiting position, so instead of the normal
              hub this is just a place to move every ATH recruit/board target/roster
              player onto the actual position group they're being brought in for. ── */}
          {!showConfig && !isOverview && activePos === 'ATH' && (
            <div className="p-4 space-y-3 flex-1 overflow-y-auto">
              {(() => {
                const NON_ATH = POSITIONS.filter(p => p !== 'ATH');
                const tid  = dynasty?.currentTid;
                const year = Number(dynasty?.currentYear);
                const rosterAth = tid ? (dynasty.players || []).filter(p => {
                  if (p.isHonorOnly || !isPlayerOnRoster(p, tid, year)) return false;
                  const pp = (p.positionByYear?.[year] ?? p.positionByYear?.[String(year)] ?? p.position ?? '').toUpperCase();
                  return pp === 'ATH';
                }) : [];

                const renderRow = (pl, badge) => {
                  const arch = pl.archetype || '';
                  const defaultPos = ATH_ARCH_TO_POS[arch] || '—';
                  const isOverridden = !!athPositions[pl.pid];
                  return (
                    <div key={pl.pid} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-2 border border-surface-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-txt-secondary truncate">{pl.name}</p>
                        <p className="text-[8px] text-txt-tertiary">{arch || 'No archetype'}{badge ? ` · ${badge}` : ''}</p>
                      </div>
                      {isOverridden && <span className="text-[7px] text-txt-tertiary">override</span>}
                      <select
                        value={athPositions[pl.pid] || defaultPos}
                        onChange={e => setAthPosition(pl.pid, e.target.value)}
                        className="bg-surface-4 border border-slate-700 text-[10px] font-bold text-txt-primary rounded px-1.5 py-0.5 focus:outline-none focus:border-emerald-600 cursor-pointer"
                      >
                        {NON_ATH.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  );
                };

                if (!rosterAth.length && !posPlayers.length && !posRemovedPlayers.length) {
                  return (
                    <div className="rounded-xl border border-surface-4 bg-surface-3 p-6 text-center">
                      <p className="text-xs text-txt-tertiary">No ATH players on the roster or recruiting board right now.</p>
                    </div>
                  );
                }

                return (
                  <div className="rounded-xl border border-surface-4 bg-surface-3 p-4 space-y-3">
                    <div>
                      <p className="text-sm font-display font-black uppercase tracking-wide text-txt-primary">ATH · Position Assignments</p>
                      <p className="text-[10px] text-txt-tertiary mt-0.5 leading-snug">ATH isn't a real recruiting position — every player here is auto-assigned to a position group based on archetype. Use the dropdown to move anyone to the group you're actually bringing them in for; they'll then count toward that position's roster and recruiting analysis instead of ATH.</p>
                    </div>
                    {rosterAth.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[8px] font-display font-black uppercase tracking-[0.12em] text-slate-500">On Roster</p>
                        {rosterAth.map(pl => renderRow(pl, 'Roster'))}
                      </div>
                    )}
                    {posPlayers.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[8px] font-display font-black uppercase tracking-[0.12em] text-slate-500">Board Targets</p>
                        {posPlayers.map(pl => renderRow(pl, null))}
                      </div>
                    )}
                    {posRemovedPlayers.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[8px] font-display font-black uppercase tracking-[0.12em] text-slate-500">Removed</p>
                        {posRemovedPlayers.map(pl => renderRow(pl, 'Removed'))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Position-specific views (hidden in overview or configure mode) */}
          {!showConfig && !isOverview && activePos !== 'ATH' && (<>


          {/* ── HUB VIEW ── */}
          <div className="p-4 space-y-3 flex-1 overflow-y-auto">

              {/* ── Situation Card: verdict + roster + analyst read ── */}
              {(() => {
                const boxBg = 'bg-surface-2 border-surface-4';
                // Positions with independent sides (OT/OG/DE/OLB) get their own
                // verdict/headline/targeting per sub-position instead of one
                // blended read for the whole group — the coach can work LT and
                // RT (etc.) as genuinely separate rooms.
                const subPosList = rosterContext[activePos]?.subPositions;
                const subHubs = subPosList ? subPosList.map(sg => {
                  const key = `${activePos}:${sg.label}`;
                  return {
                    key, label: sg.label,
                    ...buildSubHub(sg.label, sg.allPlayers, sg, posRecruitStrategy[key], posExtraTargets[key], verdictOverrides[key], depthTagOverrides[key]),
                  };
                }) : null;

                // One "Targeting Strategy" block — reused once for a plain
                // position, or once per sub-position when subHubs exist.
                const renderTargeting = (key, hubLike, label) => {
                  const saved = posRecruitStrategy[key];
                  const effHs     = saved?.hs     !== undefined ? saved.hs     : (hubLike.autoStrategy?.hs     ?? false);
                  const effPortal = saved?.portal !== undefined ? saved.portal : (hubLike.autoStrategy?.portal ?? false);
                  return (
                    <div key={key}>
                      {label && <p className="text-[9px] font-display font-black uppercase tracking-wide text-txt-secondary mb-1">{label}</p>}
                      <div className="flex gap-2 items-center flex-wrap">
                        {[
                          { type: 'hs',     label: 'HS Recruit',    activeClass: 'bg-surface-4 border-surface-5 text-txt-primary', autoClass: 'bg-surface-3 border-surface-4 text-txt-secondary' },
                          { type: 'portal', label: 'Portal Target', activeClass: 'bg-surface-4 border-surface-5 text-txt-primary', autoClass: 'bg-surface-3 border-surface-4 text-txt-secondary' },
                        ].map(({ type, label: btnLabel, activeClass, autoClass }) => {
                          const isManuallySet = saved?.[type] !== undefined;
                          const isActive = isManuallySet ? saved[type] : (hubLike.autoStrategy?.[type] ?? false);
                          const isAuto = isActive && !isManuallySet;
                          return (
                            <button
                              key={type}
                              onClick={() => toggleRecruitStrategy(key, type)}
                              className={`text-[9px] font-display font-black uppercase tracking-wide px-3 py-1.5 rounded border transition-all ${
                                isActive ? (isAuto ? autoClass : activeClass) : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-400'
                              }`}
                            >
                              {btnLabel}
                            </button>
                          );
                        })}
                        {(() => {
                          const anyManual = saved?.hs !== undefined || saved?.portal !== undefined;
                          if (anyManual) return <span className="text-[8px] text-slate-600">· click again to remove</span>;
                          if (hubLike.autoStrategy?.portal || hubLike.autoStrategy?.hs) return <span className="text-[8px] text-slate-600">· recommended · click to confirm or deselect</span>;
                          return null;
                        })()}
                      </div>
                      {(effHs || effPortal) && (
                        <div className="mt-2 space-y-1.5">
                          <p className="text-[8px] font-display font-black uppercase tracking-[0.12em] text-slate-500">Adjust target count</p>
                          {[
                            { type: 'hs',     label: 'HS Recruit',    show: effHs,     resolved: hubLike.recruitTarget.hsMin },
                            { type: 'portal', label: 'Portal Target', show: effPortal, resolved: hubLike.recruitTarget.portalMin },
                          ].filter(r => r.show).map(({ type, label: rowLabel, resolved }) => {
                            const val = posExtraTargets[key]?.[type] ?? 0;
                            return (
                              <div key={type} className="flex items-center gap-2">
                                <span className="text-[8px] font-display font-black uppercase tracking-wide w-20 text-txt-secondary">{rowLabel}</span>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => adjustExtraTargets(key, type, -1, resolved)}
                                    disabled={resolved <= 0}
                                    className="w-5 h-5 flex items-center justify-center rounded border border-slate-700 text-slate-400 text-xs font-black hover:border-slate-500 disabled:opacity-30 disabled:cursor-not-allowed transition"
                                  >−</button>
                                  <span className="text-[10px] font-display font-black text-slate-300 w-4 text-center tabular-nums">{resolved}</span>
                                  <button
                                    onClick={() => adjustExtraTargets(key, type, 1, resolved)}
                                    disabled={val >= 4}
                                    className="w-5 h-5 flex items-center justify-center rounded border border-slate-700 text-slate-400 text-xs font-black hover:border-slate-500 disabled:opacity-30 disabled:cursor-not-allowed transition"
                                  >+</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                };

                // One "Recruiting Plan" section — reused once for a plain
                // position, or once per sub-position when subHubs exist.
                const renderPlanBox = (key, hubLike, label) => {
                  const planHs     = hubLike.recruitTarget?.hsMin     ?? 0;
                  const planPortal = hubLike.recruitTarget?.portalMin ?? 0;
                  const topName   = hubLike.recruitTarget?.topTargetName;
                  const topPortal = hubLike.recruitTarget?.topTargetIsPortal;
                  const topPid    = hubLike.recruitTarget?.topTargetPid;
                  const hsPills = [];
                  if (planHs > 0) {
                    const named = topName && !topPortal;
                    if (named) hsPills.push({ label: topName, pid: topPid });
                    for (let i = 0; i < (named ? planHs - 1 : planHs); i++) hsPills.push({ label: '1 HS', pid: null });
                  }
                  const portalPills = [];
                  if (planPortal > 0) {
                    const named = topName && topPortal;
                    if (named) portalPills.push({ label: topName, pid: topPid });
                    for (let i = 0; i < (named ? planPortal - 1 : planPortal); i++) portalPills.push({ label: '1 Portal', pid: null });
                  }
                  const posColor = hubLike.verdict.key === 'critical' ? 'text-[#E3242B]' : hubLike.verdict.key === 'depth-needed' ? 'text-[#FFC72C]' : 'text-slate-400';
                  return (
                    <div key={key} className="space-y-1.5">
                      <div className="relative" ref={openVerdictMenu === key ? verdictMenuRef : null}>
                        <button
                          type="button"
                          onClick={() => setOpenVerdictMenu(v => v === key ? null : key)}
                          title={hubLike.verdict.isManual ? 'Manually set — click to change' : 'Auto-computed — click to manually override (also resets HS/Portal targets to match)'}
                          className={`flex items-center justify-center text-[10px] font-black uppercase px-2.5 py-1 rounded-md text-center w-full transition hover:brightness-125 ${hubLike.verdict.badge} ${hubLike.verdict.isManual ? 'ring-1 ring-sky-500' : ''}`}
                        >
                          {hubLike.verdict.label}{hubLike.verdict.isManual && <span className="text-sky-400 ml-1">•</span>}
                          <ChevronDown className="w-2.5 h-2.5 ml-1" />
                        </button>
                        {openVerdictMenu === key && (
                          <OverrideMenu
                            options={VERDICT_OPTIONS}
                            current={verdictOverrides[key] ?? null}
                            onSelect={val => { setVerdictOverrideFor(key, val); setOpenVerdictMenu(null); }}
                            align="left"
                          />
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <p className={`text-sm font-display font-black tracking-wide ${posColor}`}>{label}</p>
                        {hsPills.map((pillData, i) => renderTargetPill(pillData, `hs-${i}`, pillData.label === '1 HS', { key, type: 'hs', resolved: planHs }))}
                        {portalPills.map((pillData, i) => renderTargetPill(pillData, `p-${i}`, pillData.label === '1 Portal', { key, type: 'portal', resolved: planPortal }))}
                        {hsPills.length === 0 && portalPills.length === 0 && (
                          <p className="text-[9px] text-slate-600 italic">No targets set</p>
                        )}
                      </div>
                    </div>
                  );
                };

                return (
              <div className="rounded-xl border border-surface-4 bg-surface-2 p-4 flex gap-4">

                {/* ── Left: all existing content ── */}
                <div className="flex-1 min-w-0 space-y-3">

                {/* Header */}
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="text-sm font-display font-black uppercase tracking-wide text-txt-primary">{activePos} · Position Overview</p>
                  {(depthTagOverrides[activePos] || rosterContext[activePos]?.depthTag) && (() => {
                    const isManual = !!depthTagOverrides[activePos];
                    const tag = depthTagOverrides[activePos] || rosterContext[activePos].depthTag;
                    const tagCls = tag === 'Loaded' ? 'text-emerald-400 border-emerald-800 bg-surface-3'
                      : tag === 'Deep'   ? 'text-green-300 border-green-800 bg-surface-3'
                      : tag === 'Solid'  ? 'text-txt-secondary border-surface-4 bg-surface-3'
                      : tag === 'Thin'   ? 'text-txt-secondary border-surface-4 bg-surface-3'
                      : 'text-txt-secondary border-surface-4 bg-surface-3'; // Bare
                    return (
                      <div className="relative" ref={depthTagMenuRef}>
                        <button
                          type="button"
                          onClick={() => setOpenDepthTagMenu(v => !v)}
                          title={isManual ? 'Manually set — click to change' : subHubs ? 'Auto-computed roll-up of LT/RT (etc.) — click to override the overall tag' : 'Auto-computed — click to manually override'}
                          className={`flex items-center font-display font-black text-[8px] uppercase tracking-widest px-1.5 py-0.5 rounded border transition hover:brightness-125 ${tagCls} ${isManual ? 'ring-1 ring-sky-500' : ''}`}
                        >
                          {tag}{isManual && <span className="text-sky-400 ml-1">•</span>}
                          <ChevronDown className="w-2.5 h-2.5 ml-1" />
                        </button>
                        {openDepthTagMenu && (
                          <OverrideMenu
                            options={DEPTH_TAG_OPTIONS}
                            current={depthTagOverrides[activePos] ?? null}
                            onSelect={val => { setDepthTagOverrideFor(activePos, val); setOpenDepthTagMenu(false); }}
                          />
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Analyst headline(s) — one per sub-position when independent, else one blended read */}
                {subHubs ? (
                  <div className="space-y-1">
                    {subHubs.map(sh => (
                      <h4 key={sh.key} className={`text-xs font-display font-black uppercase tracking-wide ${sh.verdict.head}`}>{sh.headline}</h4>
                    ))}
                  </div>
                ) : (
                  <h4 className={`text-xs font-display font-black uppercase tracking-wide ${hub.verdict.head}`}>{hub.headline}</h4>
                )}

                {/* ── Recruit strategy toggle ── */}
                <div className="pt-1">
                  <p className="text-[8px] font-display font-black uppercase tracking-[0.12em] text-slate-500 mb-1.5">Targeting Strategy</p>
                  {subHubs
                    ? <div className="space-y-3">{subHubs.map(sh => renderTargeting(sh.key, sh, sh.label))}</div>
                    : renderTargeting(activePos, hub, null)}
                </div>

                </div>{/* end left column */}

                {/* ── Right: Recruiting Plan vertical box ── */}
                <div className={`w-44 shrink-0 rounded-lg border p-3 flex flex-col gap-3 ${boxBg}`}>
                  <p className="text-[8px] font-display font-black uppercase tracking-[0.12em] text-txt-tertiary">Recruiting Plan</p>
                  {subHubs
                    ? subHubs.map((sh, i) => (
                        <div key={sh.key} className={i > 0 ? 'pt-3 border-t border-surface-4' : ''}>
                          {renderPlanBox(sh.key, sh, sh.label)}
                        </div>
                      ))
                    : renderPlanBox(activePos, hub, activePos)}
                </div>

              </div>
              ); // end Situation Card flex row
            })()}

              {/* ── Current Roster ── */}
              {rosterContext[activePos] && (() => {
                const rc = rosterContext[activePos];
                const QUALITY_CFG = {
                  starter:    { dot: 'bg-emerald-500', text: 'text-txt-primary', bg: 'bg-surface-3 border-surface-4' },
                  developing: { dot: 'bg-amber-500',   text: 'text-txt-secondary',   bg: 'bg-surface-3 border-surface-4' },
                  raw:        { dot: 'bg-slate-500',   text: 'text-txt-tertiary',   bg: 'bg-surface-3 border-surface-4' },
                };
                return (
                  <div className="bg-surface-3 border border-slate-800 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-display font-black uppercase tracking-wide text-txt-primary">
                        Current Roster · {activePos}
                      </p>
                      <div className="flex items-center gap-3 flex-wrap justify-end">
                        <span className="text-sm font-display font-black uppercase tracking-wide text-txt-primary">
                          {(rc.returningCount + (rc.committedCount ?? 0)) === 0 ? 'No players returning' : `${rc.returningCount + (rc.committedCount ?? 0)} on roster`}
                        </span>
                      </div>
                    </div>
                    {rc.allPlayers.length === 0 ? (
                      <p className="text-[10px] text-slate-600 italic">No {activePos} players on roster.</p>
                    ) : (
                      <div className="space-y-1">
                        {(() => {
                          // Same destination the name text used to link to — now
                          // triggered by clicking anywhere on the row.
                          const goToPlayer = pl => {
                            if (pl.isIncoming) {
                              navigate(`/dynasty/${dynasty?.id}/recruiting/${dynasty?.currentTid}/${dynasty?.currentYear}?tab=commitments`);
                            } else if (pl.pid) {
                              navigate(`/dynasty/${dynasty?.id}/player/${pl.pid}`);
                            }
                          };
                          // Shared row body — used both inside draggable sub-position
                          // groups and the plain (no sub-position) list, so the row
                          // markup only lives in one place.
                          const renderRowInner = pl => {
                            const q = QUALITY_CFG[pl.quality];
                            return (
                              <>
                                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${'bg-slate-500'}`} />
                                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                  <span className={`text-[10px] font-bold min-w-0 truncate ${q.text}`}>{pl.name}</span>
                                  {pl._subLabel !== undefined && rc.subPositions ? (
                                    <span
                                      title="Drag this row onto another sub-position group to reassign"
                                      className="text-[7px] font-display font-black uppercase px-1 py-0.5 rounded border shrink-0 text-slate-500 border-slate-700 bg-slate-900"
                                    >
                                      {pl._subLabel || pl.pos}
                                    </span>
                                  ) : (
                                    pl.pos && <span className="text-[8px] font-display font-black text-slate-600 shrink-0">{pl.pos}</span>
                                  )}
                                  {(() => {
                                    const dtCls = pl.devTrait === 'Elite'  ? 'bg-surface-3 border-[#0E7A2A] text-[#22E065] shadow-[0_0_16px_rgba(14,122,42,0.85)]'
                                               : pl.devTrait === 'Star'    ? 'bg-surface-3 border-[#9C7209] text-[#FFD100] shadow-[0_0_14px_rgba(156,114,9,0.8)]'
                                               : pl.devTrait === 'Impact'  ? 'bg-surface-3 border-[#7C8991] text-[#D6DEE2]'
                                               : pl.devTrait === 'Normal'  ? 'bg-surface-3 border-[#8C5524] text-[#CD7F32]'
                                               : 'bg-slate-950 border-slate-700 text-slate-600 italic';
                                    return (
                                      <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded border shrink-0 ${dtCls}`}>
                                        {pl.devTrait || 'Hidden'}
                                      </span>
                                    );
                                  })()}
                                </div>
                                {pl.isATH && !pl.isIncoming && <span className="text-[7px] font-black uppercase px-1 py-0.5 rounded bg-purple-950 border border-purple-800 text-purple-400 shrink-0">ATH</span>}
                                {!pl.isIncoming && <span className="text-[9px] text-slate-500 tabular-nums shrink-0">{pl.ovr > 0 ? pl.ovr : '—'} OVR</span>}
                                {!pl.isIncoming && <span className="text-[9px] text-slate-500 tabular-nums shrink-0 w-8 text-right">{pl.cls}</span>}
                                {pl.isIncoming && (
                                  <span className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded bg-surface-3 border border-[#0E7A2A] text-[#22E065] shrink-0">Incoming</span>
                                )}
                                {!pl.isLeaving && (
                                  <button
                                    onClick={e => { e.stopPropagation(); cycleProjection(pl.pid); }}
                                    title={`${
                                      pl.effectiveProj === 1 || pl.effectiveProj === 5 ? 'Projected Starter in 1 year'
                                        : pl.effectiveProj === 2 ? 'Projected Starter in 2 years'
                                        : pl.effectiveProj === 3 ? 'Projected Starter in 3 years'
                                        : pl.effectiveProj === 0 ? 'Projected Non-Starter'
                                        : 'Projected Starter in _ years'
                                    } — click to cycle: 1yr → 2yr → 3yr → Non-Starter → clear`}
                                    className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded border shrink-0 transition ${
                                      pl.isManualProj ? 'bg-surface-4 border-surface-5 text-txt-secondary hover:opacity-75' : 'bg-surface-3 border-surface-4 text-txt-tertiary hover:text-txt-secondary'
                                    }`}
                                  >
                                    {pl.effectiveProj === 1 || pl.effectiveProj === 5 ? '1YR' : pl.effectiveProj === 2 ? '2YR' : pl.effectiveProj === 3 ? '3YR' : pl.effectiveProj === 0 ? 'Non-Starter' : 'Project'}
                                  </button>
                                )}
                                {pl.isSenior && !pl.leavingType && !pl.isIncoming && (
                                  <span className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded bg-surface-3 border border-[#7A1F1F] text-[#E3242B] shrink-0">Leaving</span>
                                )}
                                {!pl.isSenior && !pl.isIncoming && (
                                  <button
                                    onClick={e => { e.stopPropagation(); cycleLeaving(pl.pid); }}
                                    title="Departure risk — click to cycle: Draft Risk → Transfer Risk → Cut → clear"
                                    className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded border shrink-0 transition ${
                                      pl.leavingType ? 'bg-surface-3 border-[#7A1F1F] text-[#E3242B] hover:opacity-75' : 'bg-surface-3 border-surface-4 text-txt-tertiary hover:text-txt-secondary'
                                    }`}
                                  >
                                    {pl.leavingType === 'draft' ? 'Draft Risk' : pl.leavingType === 'transfer' ? 'Transfer Risk' : pl.leavingType === 'cut' ? 'Cut' : 'Leaving'}
                                  </button>
                                )}
                              </>
                            );
                          };
                          const rowClassName = pl => `flex items-center gap-3 px-3 py-2 rounded-lg border border-surface-4 bg-surface-3 cursor-pointer hover:bg-surface-4 hover:border-surface-5 transition ${pl.isLeaving ? 'opacity-60' : ''}`;

                          if (!rc.subPositions) {
                            return rc.allPlayers.map((pl, i) => (
                              <div key={i} onClick={() => goToPlayer(pl)} className={rowClassName(pl)}>{renderRowInner(pl)}</div>
                            ));
                          }

                          const labels = rc.subPositions.map(sg => sg.label);
                          const groups = {};
                          labels.forEach(l => { groups[l] = []; });
                          const assigned = new Set();
                          // Apply overrides first
                          rc.allPlayers.forEach(pl => {
                            const ov = subPosOverrides[pl.pid];
                            if (ov && groups[ov]) {
                              groups[ov].push({ ...pl, _subLabel: ov });
                              assigned.add(pl.pid || pl.name);
                            }
                          });
                          // Natural assignment for the rest
                          rc.subPositions.forEach(sg => {
                            sg.players.forEach(pl => {
                              if (!assigned.has(pl.pid || pl.name)) {
                                groups[sg.label].push({ ...pl, _subLabel: sg.label });
                                assigned.add(pl.pid || pl.name);
                              }
                            });
                          });
                          // Sort each group by OVR desc
                          labels.forEach(l => groups[l].sort((a, b) => b.ovr - a.ovr));
                          const unassigned = rc.allPlayers
                            .filter(p => !assigned.has(p.pid || p.name))
                            .map(pl => ({ ...pl, _subLabel: null }));

                          return (
                            <DndContext
                              sensors={rosterDndSensors}
                              collisionDetection={pointerWithin}
                              onDragStart={e => setActiveDragId(e.active.id)}
                              onDragEnd={onRosterDragEnd}
                              onDragCancel={() => setActiveDragId(null)}
                            >
                              <div className="space-y-1">
                                {labels.map(l => {
                                  if (!groups[l].length) return null;
                                  return (
                                    <RosterDropArea key={l} id={`subpos:${l}`}>
                                      <p className="text-[8px] font-display font-black uppercase tracking-[0.12em] text-slate-500 pt-2 pb-0.5 border-t border-slate-800/60 first:border-t-0 first:pt-0">{l}</p>
                                      <div className="space-y-1">
                                        {groups[l].map((pl, i) => (
                                          <RosterDraggableRow key={pl.pid || `${l}-${i}`} id={pl.pid || `${l}-${i}`} className={rowClassName(pl)} dimmed={pl.isLeaving} onClick={() => goToPlayer(pl)}>
                                            {renderRowInner(pl)}
                                          </RosterDraggableRow>
                                        ))}
                                      </div>
                                    </RosterDropArea>
                                  );
                                })}
                                {unassigned.map((pl, i) => (
                                  <div key={`unassigned-${i}`} onClick={() => goToPlayer(pl)} className={rowClassName(pl)}>{renderRowInner(pl)}</div>
                                ))}
                              </div>
                              {createPortal(
                                <DragOverlay zIndex={10000} dropAnimation={null}>
                                  {activeDragId ? (() => {
                                    const dragged = rc.allPlayers.find(p => (p.pid || p.name) === activeDragId);
                                    return dragged ? (
                                      <div className="px-3 py-2 rounded-lg border border-slate-600 bg-slate-800 shadow-2xl text-[10px] font-bold text-white whitespace-nowrap">
                                        {dragged.name}
                                      </div>
                                    ) : null;
                                  })() : null}
                                </DragOverlay>,
                                document.body
                              )}
                            </DndContext>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── Actively Targeting (directly tied to the Big Board in Targets — same
                  boardRemoved field, same toggle) ── */}
              {(() => {
                const scoreAndSort = list => list
                  .map(p => { const s = computeScore(p, weightsMap); return { ...p, score: s, tier: getTier(s) }; })
                  .sort((a, b) => b.score - a.score);
                const activeScored  = scoreAndSort(posPlayers);
                const removedScored = scoreAndSort(posRemovedPlayers);

                const renderRow = (pl, { removed }) => {
                  const g = getGrade(pl.score);
                  const dtCls = pl.devTrait === 'Elite'  ? 'bg-surface-3 border-[#0E7A2A] text-[#22E065] shadow-[0_0_16px_rgba(14,122,42,0.85)]'
                             : pl.devTrait === 'Star'    ? 'bg-surface-3 border-[#9C7209] text-[#FFD100] shadow-[0_0_14px_rgba(156,114,9,0.8)]'
                             : pl.devTrait === 'Impact'  ? 'bg-surface-3 border-[#7C8991] text-[#D6DEE2]'
                             : pl.devTrait === 'Normal'  ? 'bg-surface-3 border-[#8C5524] text-[#CD7F32]'
                             : 'bg-slate-950 border-slate-700 text-slate-600 italic';
                  return (
                    <div
                      key={pl.pid}
                      onClick={() => navigate(`/dynasty/${dynasty?.id}/recruiting/${dynasty?.currentTid}/${dynasty?.currentYear}?tab=staff&view=database&pid=${pl.pid}`)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg border border-surface-4 bg-surface-3 cursor-pointer hover:bg-surface-4 hover:border-surface-5 transition ${removed ? 'opacity-60' : ''}`}
                    >
                      <div className="w-1.5 h-1.5 rounded-full shrink-0 bg-slate-500" />
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <span className="relative inline-block min-w-0 max-w-[60%] shrink">
                          <span className="text-[10px] font-bold text-txt-primary truncate block">{pl.name}</span>
                          <GemBustIcon type={pl.gemBust} />
                        </span>
                        <span className="text-[8px] font-display font-black text-slate-600 shrink-0">{pl.position || activePos}</span>
                        <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded border shrink-0 ${dtCls}`}>
                          {pl.devTrait || 'Hidden'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${g.cls}`}>{g.grade}</span>
                        <span className="text-[9px] font-black tabular-nums text-slate-400">{pl.score.toFixed(0)}</span>
                        {onToggleBoardRemoved && (
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); onToggleBoardRemoved(pl); }}
                            className={`shrink-0 p-1 rounded transition ${removed ? 'text-slate-600 hover:text-emerald-400 hover:bg-emerald-950/40' : 'text-slate-600 hover:text-red-400 hover:bg-red-950/40'}`}
                            title={removed ? 'Restore to board' : 'Remove from board'}
                          >
                            {removed ? (
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
                              </svg>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                                <circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/>
                              </svg>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                };

                return (
                  <>
                    {activeScored.length > 0 && (
                      <div className="bg-surface-3 border border-slate-800 rounded-xl p-4 space-y-2">
                        <p className="text-sm font-display font-black uppercase tracking-wide text-txt-primary">
                          Actively Targeting · {activeScored.length} prospect{activeScored.length !== 1 ? 's' : ''}
                        </p>
                        <div className="space-y-1">
                          {activeScored.map(pl => renderRow(pl, { removed: false }))}
                        </div>
                      </div>
                    )}
                    {removedScored.length > 0 && (
                      <div className="bg-surface-3 border border-slate-800 rounded-xl p-4 space-y-2">
                        <p className="text-sm font-display font-black uppercase tracking-wide text-txt-primary">
                          Removed · {removedScored.length} prospect{removedScored.length !== 1 ? 's' : ''}
                        </p>
                        <div className="space-y-1">
                          {removedScored.map(pl => renderRow(pl, { removed: true }))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}

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
                  <div className="bg-surface-3 border border-slate-800 rounded-xl p-4 space-y-3">
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
                            className="flex items-start gap-2.5 text-left px-3 py-2.5 rounded-lg hover:bg-surface-3 transition group"
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
