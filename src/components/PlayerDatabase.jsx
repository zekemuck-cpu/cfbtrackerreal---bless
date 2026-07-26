import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createStaffAccessor } from './staffDB';
import { archetypeBaseScore, computeScore, calcWeightedAvg, gemBustBonus, isHiddenDev, normalizeArch, STAR_BONUS, getScoreConfidence } from './archetypeWeights';
import { buildRevealedPool, getFormAttrs } from '../utils/devTraitLearning';
import { buildAttributeQualityMap, predictFloorCeiling, describeFloorCeilingPills } from '../utils/devPrediction';
import { ATTRIBUTE_ABBR, positionBucket, recruitingPosLabel } from '../utils/recruitAttributes';
import { resolveRecruitGroup } from '../utils/recruitGroup';
import { OPTIONS_REGISTRY } from './ScoutingReport';
import GemBustIcon from './GemBustIcon';
import { useDynasty } from '../context/DynastyContext';
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler';
import AuthErrorModal from './AuthErrorModal';
import ConfirmModal from './ConfirmModal';
import { useToast } from './ui/Toast';
import RecruitingDatabaseImportModal from './RecruitingDatabaseImportModal';
import RecruitingDatabaseBatchEditModal from './RecruitingDatabaseBatchEditModal';
import { downloadRecruitingDatabaseJson, computeRecentRanks, reorderByRecentRank } from '../utils/recruitingDatabasePool';
import { getContrastTextColor } from '../utils/colorUtils';
import { Modal } from './ui';

// Places the gem/bust icon at the diagonal right end of the name's actual
// FIRST rendered line — whether that line ends up being the whole name (short
// name, fits on one line) or just the first word (long name that wraps).
// Text wrapping depends on the live column width, so we can't know which case
// applies just from the string — render once, measure, and only re-anchor to
// the first word if the browser actually wrapped it to a second line.
function ProspectName({ name, gemBust }) {
  const hiddenRef = useRef(null);
  const [wrapped, setWrapped] = useState(false);
  const splitAt = name.indexOf(' ');

  // Range.getClientRects() returns one rect per visual line a run of content
  // occupies — a direct, font/line-height-agnostic way to tell whether the
  // name actually wrapped under the live column width. (An earlier version of
  // this check compared el.offsetHeight against getComputedStyle(el).lineHeight,
  // which silently breaks whenever line-height resolves to the non-numeric
  // keyword "normal" instead of a pixel value — that's why the split-name
  // anchor stopped working in the running app despite working in isolation.)
  // The measurement runs against an invisible clone, kept separate from the
  // visible markup below, so switching which branch is displayed can never
  // invalidate what's being measured.
  useLayoutEffect(() => {
    const el = hiddenRef.current;
    if (!el || splitAt === -1) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    const isWrapped = range.getClientRects().length > 1;
    setWrapped(prev => (prev !== isWrapped ? isWrapped : prev));
  });

  if (splitAt === -1) {
    return <span className="relative inline-block">{name}<GemBustIcon type={gemBust} /></span>;
  }

  const firstWord = name.slice(0, splitAt);
  const rest = name.slice(splitAt);

  return (
    <span className="relative block">
      <span ref={hiddenRef} aria-hidden="true" className="invisible absolute inset-0 pointer-events-none">{name}</span>
      {wrapped ? (
        <>
          <span className="relative inline-block">{firstWord}<GemBustIcon type={gemBust} /></span>
          {rest}
        </>
      ) : (
        <span className="relative inline-block">{name}<GemBustIcon type={gemBust} /></span>
      )}
    </span>
  );
}

// ── Grade tier definitions ───────────────────────────────────────────────────
// `color` is the same hex baked into each badgeCls's text-[...] class, exposed
// as a plain value too so other surfaces (e.g. the Targets board, which sets
// an inline style color rather than one of these class strings) can match
// these exact grade colors instead of drifting to their own palette.
export const GRADE_TIERS = [
  { grade: 'A+', min: 95, color: '#3DFF7F', badgeCls: 'bg-surface-3 border-[#0F9D3E] text-[#3DFF7F]' },
  { grade: 'A',  min: 90, color: '#22E065', badgeCls: 'bg-surface-3 border-[#0E7A2A] text-[#22E065]' },
  { grade: 'A-', min: 86, color: '#17C454', badgeCls: 'bg-surface-3 border-[#0B6420] text-[#17C454]' },
  { grade: 'B+', min: 82, color: '#FFDD33', badgeCls: 'bg-surface-3 border-[#B8860B] text-[#FFDD33]' },
  { grade: 'B',  min: 78, color: '#FFD100', badgeCls: 'bg-surface-3 border-[#9C7209] text-[#FFD100]' },
  { grade: 'B-', min: 74, color: '#E8B923', badgeCls: 'bg-surface-3 border-[#7A5C08] text-[#E8B923]' },
  { grade: 'C+', min: 70, color: '#F0F5F7', badgeCls: 'bg-surface-3 border-[#9BA7AF] text-[#F0F5F7]' },
  { grade: 'C',  min: 66, color: '#D6DEE2', badgeCls: 'bg-surface-3 border-[#7C8991] text-[#D6DEE2]' },
  { grade: 'C-', min: 62, color: '#AEB7BC', badgeCls: 'bg-surface-3 border-[#606B73] text-[#AEB7BC]' },
  { grade: 'D+', min: 58, color: '#FF9F40', badgeCls: 'bg-surface-3 border-[#B35900] text-[#FF9F40]' },
  { grade: 'D',  min: 54, color: '#CD7F32', badgeCls: 'bg-surface-3 border-[#8C5524] text-[#CD7F32]' },
  { grade: 'D-', min: 50, color: '#C86A1E', badgeCls: 'bg-surface-3 border-[#7A4210] text-[#C86A1E]' },
  { grade: 'F',  min: 0,  color: '#CD7F32', badgeCls: 'bg-surface-3 border-[#8C5524] text-[#CD7F32]' },
];

// Same badge styling (color + border + glow) as the dev trait pill in the
// Recruiting Database table — exported so other surfaces (e.g. the Targets
// board's row line) can show the exact same pill without duplicating its
// styling.
export function DevTraitPill({ devTrait }) {
  if (isHiddenDev(devTrait)) {
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-950 border border-slate-700 text-slate-600 italic">HIDDEN</span>;
  }
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
      devTrait === 'Elite'  ? 'bg-surface-3 border border-[#0E7A2A] text-[#22E065]' :
      devTrait === 'Star'   ? 'bg-surface-3 border border-[#9C7209] text-[#FFD100]' :
      devTrait === 'Impact' ? 'bg-surface-3 border border-[#7C8991] text-[#D6DEE2]' :
                               'bg-surface-3 border border-[#8C5524] text-[#CD7F32]'
    }`}>{devTrait.toUpperCase()}</span>
  );
}

// Same per-trait color + glow as DevTraitPill above, but as plain text
// classes (no pill background/border) — for spots like the Floor/Ceiling
// boxes that print the trait name inline rather than as a badge. Anything
// that isn't an exact single trait name (e.g. a joined "Star/Elite" ceiling
// label) falls through to plain white, since there's no single color to
// apply to a range.
function devTraitTextCls(devTrait) {
  return devTrait === 'Elite'  ? 'text-[#22E065] [text-shadow:0_0_16px_rgba(14,122,42,0.85)]' :
         devTrait === 'Star'   ? 'text-[#FFD100] [text-shadow:0_0_14px_rgba(156,114,9,0.8)]' :
         devTrait === 'Impact' ? 'text-[#D6DEE2]' :
         devTrait === 'Normal' ? 'text-[#CD7F32]' :
                                  'text-white';
}

// Same per-trait border + glow as DevTraitPill's badge (and devTraitTextCls's
// text color) — for a whole container (the Floor/Ceiling boxes) instead of
// just the trait text inside it. Anything that isn't an exact single trait
// name (e.g. a joined "Star/Elite" ceiling label, or no data at all) falls
// through to the plain neutral outline, same reasoning as devTraitTextCls.
function devTraitBoxCls(devTrait) {
  return devTrait === 'Elite'  ? 'border-[#0E7A2A]' :
         devTrait === 'Star'   ? 'border-[#9C7209]' :
         devTrait === 'Impact' ? 'border-[#7C8991]' :
         devTrait === 'Normal' ? 'border-[#8C5524]' :
                                  'border-surface-4';
}
// ── Combine projections base times / reps ────────────────────────────────────
const BASE_FORTY = {
  QB: 4.68, HB: 4.46, WR: 4.44, TE: 4.72, OT: 5.28, OG: 5.25, C: 5.22,
  DE: 4.76, DT: 5.10, OLB: 4.65, MIKE: 4.63, CB: 4.42, FS: 4.50, SS: 4.53, ATH: 4.48,
};

// ── Deterministic seeding ────────────────────────────────────────────────────
function nameHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}
function seeded(seed, min, max) {
  const x = ((Math.sin(seed + 1) * 43758.5453123) % 1 + 1) % 1;
  return min + x * (max - min);
}

// computeScore returns null when a recruit genuinely can't be graded yet (no
// comps for this archetype at any star level, or he hasn't been scouted at
// all) — this renders as a plain "-" everywhere a grade badge shows, same
// shape as a real tier so every caller can keep using tier.grade/badgeCls
// without a separate null-check.
export const UNGRADED_TIER = { grade: '-', min: null, color: '#6B7280', badgeCls: 'bg-surface-3 border-surface-4 text-slate-500' };

export function getGradeTier(score) {
  if (score == null) return UNGRADED_TIER;
  return GRADE_TIERS.find(t => score >= t.min) ?? GRADE_TIERS[GRADE_TIERS.length - 1];
}

// ── Pool context ─────────────────────────────────────────────────────────────
// Rank + average Composite Score within some slice of the pool (everyone,
// same position, or same position+archetype) — same computeScore every
// prospect in the app is graded with, so the average is directly comparable
// to the Composite Score shown above it. Matches by pid (falls back to name
// for the rare caller without one) since two prospects can share a name.
function getPoolStats(player, allPlayers, weightsMap, pool, filterFn) {
  // allPlayers can be the WHOLE dynasty roster (e.g. the Targets board passes
  // dynasty.players), not just scouted prospects — an un-scouted player's
  // attributes get normalized to {} above, and computeScore on an empty
  // attribute set used to come out near 0, dragging every average (and
  // inflating every "of N total") down toward meaningless filler entries.
  // computeScore now returns null for anyone it can't actually grade (not
  // scouted, or zero real comps for his archetype anywhere) — filtering those
  // out here keeps a comparison pool to only real, gradeable prospects.
  const scoutedOnly = allPlayers.filter(p => Object.keys(p.attributes || {}).length > 0);
  const group = filterFn ? scoutedOnly.filter(filterFn) : scoutedOnly;
  const scored = group
    .map(p => ({ p, score: computeScore(p, weightsMap, pool) }))
    .filter(({ score }) => score != null)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return { rank: 0, total: 0, avg: null };
  const rank = scored.findIndex(({ p }) => (player.pid != null ? p.pid === player.pid : p.name === player.name)) + 1;
  const avg = scored.reduce((sum, { score }) => sum + score, 0) / scored.length;
  return { rank, total: group.length, avg };
}

// True once at least one real attribute value has been entered — a fresh
// import/manual add can have attributes: null (or an empty object) until
// someone actually scouts the player. Combine/GPA/quote generation reads
// this to skip fabricating numbers off of nothing but position defaults.
function hasScoutedAttributes(player) {
  return !!(player.attributes && Object.values(player.attributes).some(v => v != null));
}

// ── Combine projections ──────────────────────────────────────────────────────
function generateCombine(player) {
  const h = nameHash(player.name);
  // A recruit can genuinely have attributes: null (never scouted) — default
  // to an empty object so an unscouted recruit doesn't crash every table
  // render/sort that touches this, just falls back to the neutral defaults.
  const a = player.attributes || {};
  const get = (k, def = 70) => a[k] ?? def;

  const speed = get('Speed');
  const accel = get('Acceleration');
  const str   = get('Strength');
  const agl   = get('Agility') || get('Change of Direction') || 70;

  const base40 = BASE_FORTY[player.position] ?? 4.72;
  const forty  = Math.max(4.20, +(base40 - (speed - 70) * 0.006 - (accel - 70) * 0.004 + seeded(h, -0.04, 0.04)).toFixed(2));

  const benchBase = ['OT','OG','C','DE','DT'].includes(player.position) ? 28 : 18;
  const bench = Math.max(5, Math.round(benchBase + (str - 70) * 0.3 + seeded(h + 1, -2, 2)));

  const vertBase = ['WR','HB','CB','FS','SS','ATH'].includes(player.position) ? 36 : 31;
  const vert = +(vertBase + (speed - 70) * 0.12 + (accel - 70) * 0.08 + seeded(h + 2, -1, 1)).toFixed(1);

  const coneBase = ['CB','WR','HB','ATH'].includes(player.position) ? 6.72 : 7.18;
  const cone = +(coneBase - (agl - 70) * 0.005 + seeded(h + 3, -0.04, 0.04)).toFixed(2);

  const broad = Math.round(110 + (speed - 70) * 0.35 + (accel - 70) * 0.2 + seeded(h + 4, -3, 3));

  return { forty, bench, vert, cone, broad };
}

// Broad jump is stored/generated in total inches (~100-125, a realistic
// combine range) — display it as feet'inches" (e.g. 115 -> 9'7") rather than
// the raw inch count, which reads like a nonsensical "115 inch" jump.
function formatBroad(totalInches) {
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}'${inches}"`;
}

// ── Academic profile ─────────────────────────────────────────────────────────
const MAJORS = [
  'Communications', 'Business Administration', 'Sports Management', 'Criminal Justice',
  'Kinesiology', 'Exercise Science', 'Education', 'Marketing', 'Psychology', 'Sociology',
];

function generateAcademic(player) {
  const h = nameHash(player.name);
  const awareness = (player.attributes || {})['Awareness'] ?? 66;
  // Awareness 56 (low) → ~2.30 | Awareness 66 (avg) → ~3.05 | Awareness 76 (high) → ~3.80
  const base = 2.30 + (awareness - 56) * 0.075;
  const gpa = Math.min(4.0, Math.max(2.30, base + seeded(h + 99, -0.15, 0.15)));
  return { gpa: gpa.toFixed(2), major: MAJORS[h % MAJORS.length] };
}

// ── Player quotes — dynamic, attribute-driven responses to scout's question ──
function generateQuote(player) {
  const h = nameHash(player.name);
  const a = player.attributes || {};
  const get = k => a[k] ?? 0;
  let pool = [];

  switch (player.position) {
    case 'QB': {
      const spd = get('Speed'), pow = get('Throw Power');
      const accAvg = (get('Short Accuracy') + get('Medium Accuracy') + get('Deep Accuracy')) / 3;
      const pressure = get('Under Pressure');
      if (spd >= 83 && pow >= 80)
        pool = ["Honestly I can beat you both ways. You gotta decide which one you're stopping.",
                "I don't want to just sit in the pocket the whole game. I want to move around and make plays.",
                "My legs are a weapon. A lot of quarterbacks can't say that. I can."];
      else if (pow >= 87)
        pool = ["I got a cannon. I can fit it in tight windows that most guys won't even try.",
                "My arm strength is what separates me. I put it wherever I want.",
                "I throw it hard and I throw it far. My receivers know just go up and get it."];
      else if (accAvg >= 82)
        pool = ["I'm accurate. Like really accurate. I put it right where only my guy can get it.",
                "I take care of the ball. I don't force stuff. I find the open guy.",
                "My whole thing is I don't beat myself. I'm efficient, I protect the ball, I win games."];
      else if (pressure >= 83)
        pool = ["I actually get better when it gets loud and the pocket breaks down. I don't know why.",
                "Big moments don't bother me at all. I think I actually want the pressure.",
                "Fourth quarter, game on the line — that's when you see who I really am."];
      else
        pool = ["I go out there and make plays. That's it. Film speaks for itself.",
                "I can hurt you through the air. Give me time and I'll find the open man.",
                "I'm a competitor. Whatever the team needs I'm gonna give it."];
      break;
    }

    case 'HB': {
      const spd = get('Speed'), bt = get('Break Tackle'), juke = get('Juke Move');
      const catching = get('Catching'), vision = get('BC Vision');
      if (spd >= 90)
        pool = ["Give me one step in the open field and I'm gone. That's not me talking — that's just facts.",
                "I'm fast. Like genuinely fast. One crease and this whole thing changes.",
                "I ran a 4.3 at the last camp. You probably already know. That speed is real."];
      else if (bt >= 83)
        pool = ["I don't go down on first contact. Never have. You need multiple guys to bring me down.",
                "I'm physical. I want to run through you before I run around you.",
                "I run hard every carry. I'm trying to make it hurt for the defense."];
      else if (juke >= 83)
        pool = ["I'm elusive in space. I don't even think about the moves, they just happen.",
                "My change of direction is nasty. I been working on it since I was like nine.",
                "Give me room to operate and I'll make people look silly. That's my honest answer."];
      else if (catching >= 78)
        pool = ["I'm a weapon out of the backfield too. Don't just think of me as a runner.",
                "I can run routes. I'm a real receiving threat. That opens up the whole offense.",
                "My hands are good. Put me in space in the passing game and you'll see."];
      else if (vision >= 82)
        pool = ["I see it before it opens. The field slows down for me behind the line.",
                "Patience is my thing. I wait on my blocks and then I hit the hole.",
                "Vision separates me from other backs. I know where to go before the hole's even there."];
      else
        pool = ["Give me the ball and I'll figure it out. That's what I do.",
                "I run hard and I make people miss. Simple as that.",
                "I compete every carry. Every single one."];
      break;
    }

    case 'WR': {
      const spd = get('Speed');
      const routeAvg = (get('Short Route') + get('Medium Route') + get('Deep Route')) / 3;
      const cit = get('Catch In Traffic'), spec = get('Spectacular Catch');
      if (spd >= 90)
        pool = ["My speed is my whole thing. I get a step and it's a different game.",
                "I run a 4.3 for real. Put me in a line and you'll see. That's what I bring.",
                "I'm the fastest person on the field pretty much every week. That's not changing."];
      else if (routeAvg >= 83)
        pool = ["My routes are clean. I've been working on that every single day.",
                "I don't need to be the fastest if my footwork is right. I get open because I'm precise.",
                "I can beat you at the line, off the stem, at the top of the route. I work all of it."];
      else if (cit >= 84 || spec >= 84)
        pool = ["Throw it up in traffic and trust me to go get it. That's my whole pitch.",
                "I want the contested ball. That's honestly when I'm at my best.",
                "Don't worry about the coverage. Just throw it near me."];
      else
        pool = ["I just want the ball. Get it in my hands and I'm gonna make something happen.",
                "Put me in space. I'll separate and I'll catch it. Watch the tape.",
                "I make plays when it counts. That's what I keep coming back to."];
      break;
    }

    case 'TE': {
      const spd = get('Speed'), catching = get('Catching');
      const blockAvg = (get('Run Block') + get('Pass Block')) / 2;
      if (spd >= 82 && catching >= 80)
        pool = ["DBs are too small and linebackers can't run with me. That's literally the mismatch I am.",
                "I move like a wide receiver. Most teams aren't built for a tight end who does this.",
                "I'm a pass catcher first. I can block, but I want the ball in my hands."];
      else if (blockAvg >= 82)
        pool = ["I love blocking. I take it seriously. Some guys don't want to do it — I actually like it.",
                "I'll do the dirty work. That's what I'm known for. My QB stays clean.",
                "People sleep on good blocking tight ends. I think it's the most important thing I do."];
      else
        pool = ["I do a little bit of everything. Block, catch, find ways to contribute.",
                "I'm a mismatch problem in my own way. Defenses struggle to figure out how to use me.",
                "Whatever the team needs. That's my whole thing."];
      break;
    }

    case 'OT': case 'OG': case 'C': {
      const pb = get('Pass Block'), pbp = get('Pass Block Power');
      const rb = get('Run Block'), rbp = get('Run Block Power');
      if (pb >= 83 || pbp >= 83)
        pool = ["My quarterback is not getting touched. I take that personally every single game.",
                "Pass protection is technical. I'm patient, I'm smart, I don't give up free rushers.",
                "I got a chip on my shoulder every time someone even tries to get to my QB."];
      else if (rb >= 83 || rbp >= 83)
        pool = ["I love the run game. When we're moving the ball on the ground, that's me doing my job.",
                "I'm nasty in the run game. I like to finish blocks. Like really finish them.",
                "I'm physical. I want to put defenders on the ground and open up holes."];
      else
        pool = ["I'm not flashy but I get it done. Every snap.",
                "The O-line doesn't get enough credit. That's fine. We do our job either way.",
                "I been in the trenches my whole life. I know how to work."];
      break;
    }

    case 'DE': {
      const spd = get('Speed'), pow = get('Power Moves'), fin = get('Finesse Moves');
      if (spd >= 83)
        pool = ["I beat you off the edge with speed. Most linemen can't match my first step.",
                "My get-off is violent. By the time you react I'm already past you.",
                "I'm the fastest defensive lineman you've seen at this level. I mean that."];
      else if (pow >= 83)
        pool = ["I'm too strong for most offensive linemen I go against. I just physically move them.",
                "My power moves are what separates me. I can push the pocket back by myself.",
                "I bench a lot. You see it on the field on Fridays."];
      else if (fin >= 83)
        pool = ["I got too many moves. Speed rush, spin, chop — I pick one each play and I win.",
                "I'm a technical pass rusher. I'm not just running at you full speed.",
                "My move repertoire is big for my age. I've been adding to it since I was a freshman."];
      else
        pool = ["I go get the quarterback. That's my whole thought process every snap.",
                "I don't take plays off. Every snap is a chance to make something happen.",
                "Check my sack numbers. I'm in the backfield more than people think."];
      break;
    }

    case 'DT': {
      const str = get('Strength'), shed = get('Block Shedding');
      if (str >= 86)
        pool = ["I'm the strongest person on the field most weeks. That's just the reality.",
                "Double team me. I'll still find a way to make the play.",
                "You ain't running it inside on me. I haven't let that happen all season."];
      else if (shed >= 83)
        pool = ["I get off blocks fast. My hands are quick for how big I am.",
                "I don't stay blocked. That's the main thing I hang my hat on.",
                "I'm disruptive. Even when I don't make the play I mess up the whole blocking scheme."];
      else
        pool = ["I eat up space and make everyone around me better. I'm good with that role.",
                "Interior line play wins games. I know that and I take it seriously.",
                "I'm a load. The offense always knows where I am. That opens things up for the D."];
      break;
    }

    case 'OLB': case 'MIKE': {
      const recog = get('Play Recognition'), hit = get('Hit Power');
      const tackle = get('Tackle'), spd = get('Speed'), cov = get('Man Coverage');
      if (recog >= 83)
        pool = ["I read plays before the snap. Most of the time I know exactly what's coming.",
                "My football IQ is probably my best attribute if I'm being honest with you.",
                "I'm always in the right place. That's not luck — I study."];
      else if (hit >= 83 || tackle >= 83)
        pool = ["I hit people. Like for real. That's what I'm known for.",
                "Ball carriers don't want to come my way. I bring it every single play.",
                "I'm physical. I want you to feel every tackle I make."];
      else if (spd >= 82 && cov >= 78)
        pool = ["I can blitz and I can cover. You can't just leave me unaccounted for.",
                "Versatility is my whole thing. I'll rush one play and cover out the backfield the next.",
                "Coaches love that I can do both. I work at it."];
      else
        pool = ["I'm all over the field making plays. That's what the film shows.",
                "I compete every snap. Physical, fast, everywhere the ball is.",
                "I'm going to make your running backs and receivers uncomfortable. Promise."];
      break;
    }

    case 'CB': {
      const man = get('Man Coverage'), press = get('Press');
      const spd = get('Speed'), cod = get('Change of Direction'), catching = get('Catching');
      if (man >= 85)
        pool = ["Give me your best receiver. I want that matchup every week.",
                "I can lock up anybody I've gone against. I got that confidence.",
                "Man coverage is what I do. I want to be right there with them all game."];
      else if (press >= 83)
        pool = ["I'm physical at the line. I like disrupting routes before they even start.",
                "Press is where I thrive. Right in your face from the snap.",
                "I get my hands on receivers early. That messes up the whole timing of their routes."];
      else if (spd >= 88 || cod >= 85)
        pool = ["Even if I get beat I have the athleticism to come back. That's a luxury I have.",
                "My recovery speed keeps me in every play. I'm never out of it.",
                "I can close on the ball fast. My athleticism is my safety net."];
      else if (catching >= 75)
        pool = ["I'm out there looking for picks. I don't just want to break up passes.",
                "I think like a receiver when I'm out there. That's how I create turnovers.",
                "Ball hawk. That's the simplest way to describe what I do."];
      else
        pool = ["I compete on every route. Receivers don't get comfortable against me.",
                "I'm physical, I can run, I don't give up touchdowns. That's my game.",
                "I lock in on my receiver and I go. Ball doesn't get caught on me."];
      break;
    }

    case 'FS': {
      const spd = get('Speed'), zone = get('Zone Coverage');
      const recog = get('Play Recognition') || get('Awareness');
      if (spd >= 85)
        pool = ["My range is crazy. I cover so much ground it's basically unfair.",
                "I'm the last line of defense and nothing gets behind me. That's non-negotiable.",
                "QBs don't like throwing deep when I'm back there. I take that whole half away."];
      else if (zone >= 83 || recog >= 83)
        pool = ["I'm reading the quarterback the whole time. I know where it's going before he throws it.",
                "My instincts are different. I just see things before they happen.",
                "I understand coverages really well for my age. That comes from film study."];
      else
        pool = ["I see the whole field from back there. The play just develops in front of me.",
                "I'm always in the right position. I don't freelance — I trust my keys.",
                "Free safety means I go make plays. I'm comfortable with that responsibility."];
      break;
    }

    case 'SS': {
      const hit = get('Hit Power'), tackle = get('Tackle');
      const man = get('Man Coverage'), spd = get('Speed');
      if (hit >= 83 || tackle >= 83)
        pool = ["Receivers and tight ends that come over the middle know what's coming. Every time.",
                "I hit hard. That's just facts. Always been like that.",
                "I put that on film on purpose. I want them thinking about me before the snap."];
      else if (man >= 80 && spd >= 80)
        pool = ["I can play in the box and cover. That's what makes me hard to game plan for.",
                "Hybrid safety is exactly what I am. I do both sides of it well.",
                "I'm not a liability in coverage and I can tackle. That combination is tough to find."];
      else
        pool = ["I'm around the football. All the time. Watch any snap I'm on.",
                "I'm aggressive and physical. That's what I bring to the defense.",
                "I love this game. The physical side especially. I bring energy every play."];
      break;
    }

    case 'ATH': {
      const spd = get('Speed'), catching = get('Catching');
      if (spd >= 88)
        pool = ["Put me anywhere with space and my speed is going to take over.",
                "I'm just fast. Real fast. Give me the ball and step back.",
                "My athleticism is first, position second. I'll learn whatever you need."];
      else if (catching >= 80)
        pool = ["I'm a playmaker. Put it near me and I'll make something happen.",
                "I make plays in space. That's the honest answer to your question.",
                "I see myself as an offensive weapon first. But I'll play whatever helps the team."];
      else
        pool = ["I've played everywhere since I was young. I just play football.",
                "Tell me where you need me and I'll go do it. I'll be good at it.",
                "My versatility is what got me here. Put me anywhere."];
      break;
    }

    default:
      pool = ["I just play hard and let the film speak for itself.",
              "I compete every single day. That's it.",
              "Watch the tape. My game speaks for me."];
  }

  return pool[h % pool.length];
}

// ── Grade Breakdown Report ───────────────────────────────────────────────────
// The report itself, with no modal chrome (backdrop/close button) around it —
// shared verbatim by both the Targets board and the Recruiting Database,
// each embedding it inline in a per-row dropdown instead of a modal.
export function GradeReportContent({ player: rawPlayer, allPlayers, weightsMap, pool = null, wide = false }) {
  // A Recruiting Database entry always has attributes filled in, but a fresh
  // Targets recruit can genuinely have attributes: null (not scouted yet) —
  // normalize once here so every helper below (calcWeightedAvg,
  // generateCombine, etc.) sees a plain object instead of crashing on
  // `player.attributes.Speed` against null.
  const player = { ...rawPlayer, attributes: rawPlayer.attributes || {} };
  const scouted = hasScoutedAttributes(rawPlayer);
  // getPoolStats runs computeScore over every OTHER player in the pool too —
  // an unscouted Targets recruit elsewhere in allPlayers can have
  // attributes: null just like the current player did above, so the same
  // normalization has to apply to the whole pool, not just the one being
  // displayed.
  const safeAllPlayers = (allPlayers || []).map(p => (p.attributes ? p : { ...p, attributes: {} }));
  const score      = computeScore(player, weightsMap, pool);
  const baseAvg    = calcWeightedAvg(player);
  const archBase   = archetypeBaseScore(player, weightsMap);
  const usingArch  = archBase !== null;
  // Visible alongside the grade itself — a score that JUST barely qualifies
  // (thin data, or only reached via the any-star widening) renders as the
  // exact same kind of number as one built from a well-populated bucket
  // otherwise, unless this is shown.
  const confidence = usingArch ? getScoreConfidence(player, weightsMap) : null;
  const tier       = getGradeTier(score);
  // Floor/Ceiling confidence pills — informational only, no relationship to
  // the Composite Score above (see archetypeWeights.computeScore). Only
  // meaningful for a still-Hidden dev trait; a revealed one has nothing left
  // to predict.
  const hidden = isHiddenDev(player.devTrait);
  const devPills = (hidden && pool) ? (() => {
    const arch = normalizeArch(player.archetype || '');
    const formAttrs = getFormAttrs(player.position, arch);
    const result = predictFloorCeiling(pool, player.position, arch, String(player.stars ?? ''), player, formAttrs);
    return describeFloorCeilingPills(result, player.gemBust);
  })() : null;
  const starBonus  = STAR_BONUS[String(player.stars)] ?? 0;
  const gemBonus   = gemBustBonus(player);
  const combine  = scouted ? generateCombine(player) : null;
  const { gpa, major } = scouted ? generateAcademic(player) : { gpa: null, major: null };
  const quote    = generateQuote(player);
  const arch = normalizeArch(player.archetype || '');
  const rankAll      = getPoolStats(player, safeAllPlayers, weightsMap, pool, null);
  const rankPosition = getPoolStats(player, safeAllPlayers, weightsMap, pool, p => p.position === player.position);
  const rankArchetype = getPoolStats(player, safeAllPlayers, weightsMap, pool, p => p.position === player.position && normalizeArch(p.archetype || '') === arch);

  // Same form-entry order as the Recruiting Database table's Attributes
  // column (getFormAttrs first, falling back to insertion order for any
  // attribute outside that position/archetype's canonical list) — not
  // sorted by value, so this always reads as "attribute 1 through 10" the
  // way they were scouted, not a strengths/weaknesses ranking.
  const formOrder = getFormAttrs(player.position, player.archetype);
  const orderedAttrs = formOrder.length
    ? [
        ...formOrder.filter(k => player.attributes?.[k] != null).map(k => [k, player.attributes[k]]),
        ...Object.entries(player.attributes || {}).filter(([k, v]) => !formOrder.includes(k) && v != null),
      ]
    : Object.entries(player.attributes || {}).filter(([, v]) => v != null);

  return (
    <>
        {/* Header — in wide (Targets) mode, this is skipped entirely: name,
            archetype, stars, dev trait, and grade are already shown in the
            Targets row directly above this box (dev trait now lives on the
            row's own Archetype/Proj Ovr line), so repeating the full card
            here — as the Recruiting Database modal does, where none of that
            is otherwise visible — was pure wasted height. */}
        {!wide && (
          <div className="p-5 border-b border-surface-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                {recruitingPosLabel(player.rawPosition ?? player.position)} · {player.archetype}
              </p>
              <h2 className="text-xl font-black text-white">{player.name}</h2>
              <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                {player.stars}★
                <DevTraitPill devTrait={player.devTrait} />
              </p>
            </div>
            <div className={`flex flex-col items-center px-4 py-2 rounded-xl border-2 flex-shrink-0 ${tier.badgeCls}`}>
              <span className="text-3xl font-black tracking-tight">{tier.grade}</span>
              <span className="text-[8px] uppercase tracking-widest font-bold opacity-70 mt-0.5">Grade</span>
            </div>
          </div>
        )}

        {(() => {
          // Score breakdown and Strengths/Needs Work
          const scoreBreakdownEl = (
            <section>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Score Breakdown</h3>
              {score == null ? (
                <div className="bg-surface-3 border border-surface-4 rounded-lg p-4 text-center">
                  <p className="text-xl font-black text-slate-500">-</p>
                  <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                    {Object.keys(player.attributes).length === 0
                      ? 'Not scouted yet — enter attributes to grade this recruit.'
                      : `Can't grade yet — no scouted comps exist for ${player.archetype || 'this archetype'} at any star level to compare his attributes against.`}
                  </p>
                </div>
              ) : (
                <>
                  <div className="bg-surface-3 border border-surface-4 rounded-lg overflow-hidden divide-y divide-surface-4 text-xs">
                    <div className="flex justify-between items-center px-3 py-2">
                      <span className="text-slate-400">Learned Attribute Score</span>
                      <div className="flex items-center gap-2">
                        {confidence && (
                          <span
                            title={confidence.description}
                            className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                              confidence.level === 'Strong'  ? 'text-emerald-400 border-emerald-800 hover:bg-emerald-950/70 hover:border-emerald-600' :
                              confidence.level === 'Broad'   ? 'text-sky-400 border-sky-800 hover:bg-sky-950/70 hover:border-sky-600' :
                              confidence.level === 'Limited' ? 'text-amber-400 border-amber-800 hover:bg-amber-950/70 hover:border-amber-600' :
                                                                'text-orange-400 border-orange-800 hover:bg-orange-950/70 hover:border-orange-600'
                            }`}
                          >
                            {confidence.level}
                          </span>
                        )}
                        <span className="font-bold text-white">{archBase.toFixed(1)}</span>
                      </div>
                    </div>
                    <div className="flex justify-between px-3 py-2 opacity-50">
                      <span className="text-slate-500 text-[11px] italic">Attr avg (all entered)</span>
                      <span className="text-slate-500 text-[11px]">{baseAvg.toFixed(1)}</span>
                    </div>
                    {starBonus !== 0 && (
                      <div className="flex justify-between px-3 py-2">
                        <span className="text-slate-400">{player.stars}-Star Rating Bonus</span>
                        <span className={'font-bold text-txt-secondary'}>
                          {starBonus > 0 ? '+' : ''}{starBonus}
                        </span>
                      </div>
                    )}
                    {gemBonus !== 0 && (
                      <div className="flex justify-between px-3 py-2">
                        <span className="text-slate-400">{player.gemBust} Adjustment</span>
                        <span className={'font-bold text-txt-secondary'}>
                          {gemBonus > 0 ? '+' : ''}{gemBonus}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between px-3 py-2 bg-surface-4">
                      <span className="text-slate-300 font-bold">Composite Score</span>
                      <span className="font-black text-white">{score.toFixed(1)}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    {[
                      { label: 'All Prospects', stat: rankAll },
                      { label: `${recruitingPosLabel(player.position)} Prospects`, stat: rankPosition },
                      { label: player.archetype || 'Archetype', stat: rankArchetype },
                    ].map(({ label, stat }) => stat.rank > 0 && (
                      <div key={label} className="bg-surface-3 border border-surface-4 rounded-lg px-2.5 py-2.5 text-center">
                        <p className="text-[8px] font-bold uppercase tracking-wider text-slate-500 mb-1 truncate" title={label}>{label}</p>
                        <p className="text-lg font-black text-white leading-none">
                          #{stat.rank}<span className="text-slate-500 font-bold text-[11px]"> / {stat.total}</span>
                        </p>
                        <p className="text-[10px] text-slate-500 mt-1">Avg <span className="text-slate-300 font-bold">{stat.avg.toFixed(1)}</span></p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>
          );

          const attributesEl = (() => {
            const half = Math.ceil(orderedAttrs.length / 2);
            const columns = [orderedAttrs.slice(0, half), orderedAttrs.slice(half)];
            return (
              <section className="h-full flex flex-col">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-txt-tertiary mb-2">Attributes</h3>
                {/* flex-1 on the column (in the wide layout, where this
                    section stretches to match Score Breakdown's height) lets
                    the pills themselves grow to fill the column — each pill
                    getting flex-1 too means the pills get taller, not the
                    gaps between them, so spacing stays tight like the
                    non-wide layout. In the non-wide stacked layout there's no
                    extra height to fill, so this is a no-op there. */}
                <div className="grid grid-cols-2 gap-3 flex-1 min-w-0">
                  {columns.map((col, colIdx) => (
                    <div key={colIdx} className="flex flex-col gap-1.5 min-w-0">
                      {col.map(([k, v]) => (
                        // min-w-0 + overflow-hidden + truncate on the label keeps a
                        // long attribute name (e.g. "Change of Direction") from
                        // spilling past this pill into the next column instead of
                        // just wrapping/clipping in place.
                        <div key={k} className="flex-1 flex justify-between items-center gap-2 min-w-0 overflow-hidden bg-surface-3 border border-surface-4 rounded px-2.5 py-1.5">
                          <span className="text-xs text-txt-secondary font-medium truncate min-w-0">{k}</span>
                          <span className="text-xs font-black text-txt-secondary flex-shrink-0">{v}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </section>
            );
          })();

          // Combine projections. The non-wide (Recruiting Database) layout
          // shows Academic Profile (GPA) separately below via academicEl — the
          // wide Targets-board layout shows combine numbers only, no GPA
          // anywhere in the report. Both are attribute-driven, so neither is
          // generated at all until the player actually has scouted
          // attributes — a "Not Scouted" cue takes their place instead of a
          // fabricated projection built off nothing but position defaults.
          const combineStats = scouted ? [
            { label: '40 Dash',  value: `${combine.forty}s` },
            { label: 'Bench',    value: `${combine.bench} reps` },
            { label: 'Vertical', value: `${combine.vert}"` },
            { label: '3-Cone',   value: `${combine.cone}s` },
            { label: 'Broad',    value: formatBroad(combine.broad) },
          ] : [];

          const combineEl = (
            <section>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Combine Projections</h3>
              {scouted ? (
                <div className="grid grid-cols-5 gap-2">
                  {combineStats.map(({ label, value }) => (
                    <div key={label} className="bg-surface-3 border border-surface-4 rounded-lg p-2.5 text-center">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">{label}</p>
                      <p className="text-xs font-black text-white">{value}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-surface-3 border border-surface-4 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-500 italic">Not Scouted — enter attributes to generate a projection</p>
                </div>
              )}
            </section>
          );

          const academicEl = scouted ? (
            <section className="flex items-center justify-between bg-surface-3 border border-surface-4 rounded-lg px-4 py-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Degree</p>
                <p className="text-sm font-bold text-white mt-0.5">{major}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">GPA</p>
                <p className="text-xl font-black text-txt-secondary">{gpa}</p>
              </div>
            </section>
          ) : (
            <section className="bg-surface-3 border border-surface-4 rounded-lg px-4 py-3 text-center">
              <p className="text-xs text-slate-500 italic">Not Scouted — enter attributes to generate a GPA</p>
            </section>
          );

          const quoteEl = (
            <section className="bg-surface-3 border border-surface-4 rounded-lg p-4 space-y-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Scout: "Describe your game for me."</p>
              <p className="text-xs text-slate-200 leading-relaxed italic">"{quote}"</p>
              <p className="text-[9px] text-slate-500 mt-1">— {player.name}</p>
            </section>
          );

          return (
            <div className={wide ? 'p-4 space-y-3' : 'p-5 space-y-5'}>
              {(() => {
                const floorTrait = hidden ? (devPills ? devPills.floorLabel : null) : player.devTrait;
                const ceilingTrait = hidden ? (devPills ? devPills.ceilingLabel : null) : null;
                return (
                  <div className="grid grid-cols-2 gap-3">
                    <div className={`bg-surface-3 border rounded-lg px-4 py-4 transition-colors ${devTraitBoxCls(floorTrait)}`}>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Floor · Higher Confidence</p>
                      <p className="text-2xl font-black leading-none">
                        {hidden
                          ? (devPills
                              ? <><span className={devTraitTextCls(devPills.floorLabel)}>{devPills.floorLabel}</span> <span className="text-slate-400 font-black">{devPills.floorPct}%</span></>
                              : <span className="text-slate-500 italic text-lg">Hidden</span>)
                          : <><span className={devTraitTextCls(player.devTrait)}>{player.devTrait}</span> <span className="text-slate-400 font-black">100%</span></>}
                      </p>
                    </div>
                    <div className={`bg-surface-3 border rounded-lg px-4 py-4 transition-colors ${devTraitBoxCls(ceilingTrait)}`}>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Ceiling · Lower Confidence</p>
                      <p className="text-2xl font-black leading-none">
                        {hidden
                          ? (devPills
                              ? <><span className={devTraitTextCls(devPills.ceilingLabel)}>{devPills.ceilingLabel}</span> <span className="text-slate-400 font-black">{devPills.ceilingPct}%</span></>
                              : <span className="text-slate-500 italic text-lg">Hidden</span>)
                          : <span className="text-slate-500 italic">—</span>}
                      </p>
                    </div>
                  </div>
                );
              })()}

              {wide ? (
                <div className="grid lg:grid-cols-2 gap-4 items-stretch">
                  {scoreBreakdownEl}
                  {attributesEl}
                </div>
              ) : (
                <>
                  {scoreBreakdownEl}
                  {attributesEl}
                </>
              )}

              {combineEl}
              {!wide && academicEl}
              {quoteEl}
            </div>
          );
        })()}
    </>
  );
}


// ── Edit Modal ───────────────────────────────────────────────────────────────
const POSITIONS_LIST = ['QB','HB','FB','WR','TE','OT','OG','C','DE','DT','OLB','MIKE','CB','FS','SS','ATH','K','P'];
const DEV_TRAITS = ['Hidden', 'Normal', 'Impact', 'Star', 'Elite'];

function EditModal({ player, pool, weightsMap, maxRank, onSave, onClose, onDelete = null }) {
  const [form, setForm] = useState({
    name: player.name,
    position: player.position,
    archetype: player.archetype,
    devTrait: player.devTrait || 'Hidden',
    gemBust: player.gemBust || '',
    stars: player.stars,
    recentRank: player.recentRank ?? '',
    // A superset of every attribute value ever entered in this session — kept
    // separate from what's currently DISPLAYED so cycling archetypes back and
    // forth never permanently discards a value. Only the fields relevant to
    // the current position+archetype are shown (see visibleAttrKeys below),
    // but switching away and back just changes which subset is visible; the
    // underlying values for a temporarily-hidden field are still sitting here.
    allAttributes: { ...player.attributes },
  });

  const setField = (field, val) => setForm(f => ({ ...f, [field]: val }));
  const setAttr  = (key, val)   => setForm(f => ({ ...f, allAttributes: { ...f.allAttributes, [key]: val } }));

  // Archetype choices are position-specific — same registry ScoutingReport's
  // add-prospect form uses, so Edit stays consistent with how a player would
  // have been entered fresh.
  const availableArchetypes = useMemo(
    () => OPTIONS_REGISTRY.find(item => item.position === form.position)?.archetypes || [],
    [form.position]
  );
  const visibleAttrKeys = useMemo(
    () => getFormAttrs(form.position, form.archetype),
    [form.position, form.archetype]
  );
  const setPosition = (pos) => {
    const opts = OPTIONS_REGISTRY.find(item => item.position === pos)?.archetypes || [];
    setForm(f => ({ ...f, position: pos, archetype: opts.includes(f.archetype) ? f.archetype : (opts[0] || f.archetype) }));
  };
  const setArchetype = (arch) => {
    setForm(f => ({ ...f, archetype: arch }));
  };

  // The subset of allAttributes relevant to the CURRENTLY selected position +
  // archetype — this is what's shown, scored, and ultimately saved. Reading
  // through allAttributes (rather than storing this subset directly) is what
  // lets cycling back to a previous archetype restore values that were
  // temporarily hidden while a different archetype was selected.
  const visibleAttrs = useMemo(() => {
    const obj = {};
    visibleAttrKeys.forEach(k => { obj[k] = form.allAttributes[k] ?? ''; });
    return obj;
  }, [visibleAttrKeys, form.allAttributes]);

  // Floor/ceiling + confidence suggestion from revealed HS recruits at this
  // exact archetype+star — only meaningful while the real dev trait isn't
  // locked in yet. Never broadens beyond this bucket; a thin bucket just
  // returns a thin/absent prediction (see predictFloorCeiling's `status`).
  const prediction = useMemo(() => {
    if (form.devTrait !== 'Hidden' || !form.position || !form.archetype) return null;
    const numericAttrs = Object.fromEntries(Object.entries(visibleAttrs).map(([k, v]) => [k, parseInt(v, 10) || 0]));
    const formAttrs = getFormAttrs(form.position, form.archetype);
    const fakePlayer = { position: form.position, archetype: form.archetype, stars: form.stars, gemBust: form.gemBust, attributes: numericAttrs };
    return predictFloorCeiling(pool, form.position, form.archetype, String(form.stars), fakePlayer, formAttrs);
  }, [pool, form.devTrait, form.position, form.archetype, form.stars, form.gemBust, visibleAttrs]);

  // Live grade/score preview — recomputed from the in-progress form state so
  // editing attributes or dev trait visibly moves the grade before saving,
  // instead of only updating once the modal closes and the table re-renders.
  const liveScore = useMemo(() => {
    const numericAttrs = Object.fromEntries(Object.entries(visibleAttrs).map(([k, v]) => [k, parseInt(v, 10) || 0]));
    return computeScore({ position: form.position, archetype: form.archetype, devTrait: form.devTrait, stars: form.stars, gemBust: form.gemBust, attributes: numericAttrs }, weightsMap, pool);
  }, [weightsMap, pool, form.position, form.archetype, form.devTrait, form.stars, form.gemBust, visibleAttrs]);
  const liveTier = useMemo(() => getGradeTier(liveScore), [liveScore]);

  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const handleDeleteConfirmed = async () => {
    setDeleting(true);
    await onDelete(player);
    setDeleting(false);
    onClose();
  };
  const handleSave = async () => {
    // The edit form's Position dropdown only offers bucketed positions (no
    // LT vs RT) — if the user actually changed it, the old raw sub-position
    // no longer applies, so it collapses to the new bucket. Otherwise (the
    // position field wasn't touched) the original raw value is preserved.
    const originalBucket = positionBucket(player.rawPosition ?? player.position) || (player.rawPosition ?? player.position);
    const updated = {
      ...player,
      name:      form.name.trim(),
      position:  form.position,
      rawPosition: form.position === originalBucket ? (player.rawPosition ?? form.position) : form.position,
      archetype: form.archetype.trim(),
      devTrait:  form.devTrait,
      gemBust:   form.gemBust,
      stars:     form.stars,
      group:     resolveRecruitGroup(form.position, form.archetype.trim()),
      attributes: Object.fromEntries(Object.entries(visibleAttrs).map(([k, v]) => [k, parseInt(v, 10) || 0])),
      // Transient — read by handleEditSave to detect a manual "Recent #"
      // move, then stripped before anything is actually saved. Not a real
      // field on the recruit record (rank is always derived, never stored).
      _desiredRecentRank: form.recentRank === '' ? null : Number(form.recentRank),
    };
    setSaving(true);
    // onSave resolves false (and shows its own error toast) if the write
    // failed — keep the modal open with the user's edits intact so nothing
    // is lost and they can just retry, instead of closing on a failed save.
    const ok = await onSave(updated);
    setSaving(false);
    if (ok !== false) onClose();
  };

  return (
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-75 flex items-center justify-center z-[9999] p-4"
      style={{ margin: 0 }}
      onClick={onClose}
    >
      <div
        className="bg-surface-2 border border-surface-4 rounded-2xl shadow-2xl w-full max-w-lg overflow-y-auto"
        style={{ maxHeight: 'calc(100dvh - var(--app-header-height, 64px) * 2)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b border-surface-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Edit Prospect</p>
            {/* Same name+icon markup as the database row/Recently Filed, bound to the
                live form state — so the icon's position here is guaranteed to match
                exactly what saving will produce, instead of a bare name with no preview. */}
            <h2 className="text-lg font-black text-white">
              <ProspectName name={form.name} gemBust={form.gemBust} />
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="inline-flex flex-col items-center gap-0.5" title="Live grade — updates as you edit">
              <span className={`font-black tracking-wide text-xs px-2 py-0.5 rounded border ${liveTier.badgeCls}`}>{liveTier.grade}</span>
              {liveScore != null && <span className="text-[9px] tabular-nums text-slate-500">{liveScore.toFixed(1)}</span>}
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-white transition text-lg font-bold">✕</button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Basic Info */}
          <section>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Basic Info</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setField('name', e.target.value)}
                  className="w-full bg-surface-3 border border-surface-4 text-xs p-2.5 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-surface-5 transition"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Position</label>
                <select
                  value={form.position}
                  onChange={e => setPosition(e.target.value)}
                  className="w-full bg-surface-3 border border-surface-4 text-xs p-2.5 rounded-lg text-white focus:outline-none focus:border-surface-5 transition"
                >
                  {POSITIONS_LIST.map(pos => <option key={pos} value={pos}>{recruitingPosLabel(pos)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Stars</label>
                <select
                  value={form.stars}
                  onChange={e => setField('stars', e.target.value)}
                  className="w-full bg-surface-3 border border-surface-4 text-xs p-2.5 rounded-lg text-white focus:outline-none focus:border-surface-5 transition"
                >
                  {['5','4','3','2','1'].map(s => <option key={s} value={s}>{s} Star</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Recent #</label>
                <input
                  type="number"
                  min="1"
                  max={maxRank || undefined}
                  value={form.recentRank}
                  onChange={e => setField('recentRank', e.target.value)}
                  className="w-full bg-surface-3 border border-surface-4 text-xs p-2.5 rounded-lg text-white focus:outline-none focus:border-surface-5 transition"
                />
                <p className="text-[9px] text-slate-500 mt-1">Move this recruit to a different spot in the Recent order.</p>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Dev Trait</label>
                <select
                  value={form.devTrait}
                  onChange={e => setField('devTrait', e.target.value)}
                  className="w-full bg-surface-3 border border-surface-4 text-xs p-2.5 rounded-lg text-white focus:outline-none focus:border-surface-5 transition"
                >
                  {DEV_TRAITS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                {prediction && prediction.status !== 'no-data' && prediction.status !== 'same-tier-only' && (
                  <p className="text-[9px] text-txt-secondary mt-1">
                    Floor: {prediction.floorTier}
                    {prediction.floorConfidence != null && ` (~${Math.round(prediction.floorConfidence * 100)}%)`}
                    {' · '}Ceiling: {prediction.ceilingTier ?? 'open'}
                    {prediction.status === 'single-comp' && ' — 1 comp only'}
                  </p>
                )}
                {prediction && (prediction.status === 'no-data' || prediction.status === 'same-tier-only') && (
                  <p className="text-[9px] text-txt-tertiary italic mt-1">
                    Not enough comparable recruits at this archetype+star yet to predict a range.
                  </p>
                )}
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Archetype</label>
                <select
                  value={form.archetype}
                  onChange={e => setArchetype(e.target.value)}
                  className="w-full bg-surface-3 border border-surface-4 text-xs p-2.5 rounded-lg text-white focus:outline-none focus:border-surface-5 transition"
                >
                  {!availableArchetypes.includes(form.archetype) && form.archetype && (
                    <option value={form.archetype}>{form.archetype}</option>
                  )}
                  {availableArchetypes.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Gem/Bust</label>
                <select
                  value={form.gemBust}
                  onChange={e => setField('gemBust', e.target.value)}
                  className="w-full bg-surface-3 border border-surface-4 text-xs p-2.5 rounded-lg text-white focus:outline-none focus:border-surface-5 transition"
                >
                  <option value="">None</option>
                  <option value="Gem">Gem</option>
                  <option value="Bust">Bust</option>
                </select>
              </div>
            </div>
          </section>

          {/* Attributes */}
          <section>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Attributes</h3>
            {/* First half of the position's canonical form order down the left
                column, the rest down the right — NOT a row-major interleave
                (which would zigzag AWR/THP, SAC/MAC, ... across the two
                columns instead of grouping attrs 1-5 and 6-10 together). */}
            <div className="grid grid-cols-2 gap-2">
              {(() => {
                const entries = Object.entries(visibleAttrs);
                const half = Math.ceil(entries.length / 2);
                return [entries.slice(0, half), entries.slice(half)];
              })().map((col, colIdx) => (
                <div key={colIdx} className="space-y-2">
                  {col.map(([key, val]) => (
                    <div key={key} className="flex items-center gap-2 bg-surface-3 border border-surface-4 rounded-lg px-3 py-2">
                      <label className="text-[10px] uppercase text-slate-400 flex-1 truncate">{key}</label>
                      <input
                        type="number"
                        min="0"
                        max="99"
                        value={val}
                        onChange={e => setAttr(key, e.target.value)}
                        className="w-14 bg-surface-4 border border-surface-5 text-xs p-1.5 rounded text-white text-center font-bold focus:outline-none focus:border-surface-5 transition"
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        </div>

        {confirmingDelete ? (
          <div className="px-5 pb-5 space-y-3">
            <p className="text-xs font-bold text-red-400 text-center">Are you sure? This cannot be reversed.</p>
            <div className="flex gap-3">
              <button
                onClick={handleDeleteConfirmed}
                disabled={deleting}
                className="flex-1 py-2.5 bg-red-900 hover:bg-red-800 disabled:opacity-60 disabled:cursor-not-allowed border border-red-700 rounded-lg text-xs font-black text-white transition"
              >
                {deleting ? 'Deleting…' : 'Yes, Delete'}
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
                className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg text-xs font-bold text-slate-300 transition disabled:opacity-60"
              >
                No, Keep Editing
              </button>
            </div>
          </div>
        ) : (
          <div className="px-5 pb-5 space-y-3">
            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 bg-surface-4 hover:bg-surface-5 disabled:opacity-60 disabled:cursor-not-allowed border border-surface-5 rounded-lg text-xs font-black text-white transition"
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg text-xs font-bold text-slate-300 transition"
              >
                Cancel
              </button>
            </div>
            {onDelete && (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="w-full py-2 bg-transparent hover:bg-red-950/40 border border-red-900 rounded-lg text-xs font-black uppercase tracking-wide text-red-400 transition"
              >
                Delete Prospect
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PlayerDatabase({ players, roleContext, teamColors, teamLogo, onDelete, onEdit, onGoToInput, dynastyId = null, highlightPid = null, actionsRef = null, onReady = null }) {
  const { getStaffData } = createStaffAccessor(dynastyId);
  const p = teamColors?.primary || '#374151';
  const teamAccent = p;
  const teamBgText = getContrastTextColor(teamAccent);
  const [filterPos, setFilterPos] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [openPid, setOpenPid] = useState(null);
  const rowRefs = useRef({});
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [editingDevFor, setEditingDevFor] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'recency', dir: 'desc' });
  const [scoutImg, setScoutImg] = useState('');
  const [scoutName, setScoutName] = useState('National Scout');

  // The Recruiting Database is deliberately independent of the Targets tab:
  // recruits that come in through Save/Import live in
  // dynasty.recruitingDatabasePlayers, never dynasty.players/isTarget, so
  // they can never surface on the Targets page. Import ingest is local-only
  // (paste/upload a TSV) — see RecruitingDatabaseImportModal.jsx; there is no
  // live Google Sheet sync.
  const { currentDynasty, updateDynasty, updateRecruitingDatabasePlayers } = useDynasty();
  const auth = useAuthErrorHandler();
  const { toast } = useToast();
  const [showHelpPanel, setShowHelpPanel] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showBatchEditModal, setShowBatchEditModal] = useState(false);

  const recruitingDatabasePlayers = currentDynasty?.recruitingDatabasePlayers || [];

  // Everything the Recruiting Database currently shows — real targets (the
  // `players` prop) plus anything pulled in via Import. Export mirrors this
  // full combined view; Import stays scoped to recruitingDatabasePlayers only
  // (below) so a pulled-in recruit can never retroactively become an
  // isTarget record.
  //
  // recruitingDatabaseExcludedPids hides a recruit that isn't stored in
  // recruitingDatabasePlayers at all (a real Target, sourced fresh from
  // `players` every render) from this view only — used by Batch Edit's
  // "delete" for a real Target, since actually deleting one isn't available
  // from here. A real Target's pid never ends up in this list any other way.
  const excludedPids = currentDynasty?.recruitingDatabaseExcludedPids || [];
  const combinedPlayers = useMemo(() => {
    const excluded = new Set(excludedPids.map(String));
    const basePlayers = excluded.size ? players.filter(p => !excluded.has(String(p.pid))) : players;
    const merged = !recruitingDatabasePlayers.length
      ? basePlayers
      : (() => {
          const seen = new Set(basePlayers.map(p => `${p.pid}`));
          const extra = recruitingDatabasePlayers.filter(p => !seen.has(`${p.pid}`) && !excluded.has(String(p.pid)));
          return [...basePlayers, ...extra];
        })();

    // `players` only carries a partial recentRank — it's computed upstream in
    // ScoutStaff.jsx from real Targets alone, before recruitingDatabasePlayers
    // (imported entries) are merged in below, so those never got ranked at
    // all. Recompute the rank here across the FULL combined set instead via
    // the shared computeRecentRanks (same rule everywhere: earliest scoutedAt
    // first — a permanent stamp set once, at first entry — addedIndex as a
    // tiebreak for anything scouted before that field existed). This is what
    // keeps entry #1 forever #1 even as new recruits get added on top, and
    // what lets other surfaces (e.g. the Update Dev Traits dashboard task)
    // show the exact same number for a given recruit.
    const rankByKey = computeRecentRanks(merged);
    // Backfills `group` for any recruit that predates auto-classification
    // (recruitingDatabaseSheetFormat.js now stamps it at parse time for new
    // imports) — computed fresh here rather than relying on a stored value,
    // so already-existing blank/missing entries display correctly with no
    // separate data migration needed.
    return merged.map(r => ({
      ...r,
      group: r.group || resolveRecruitGroup(r.position, r.archetype),
      recentRank: rankByKey.get(`${r.pid}`),
    }));
  }, [players, recruitingDatabasePlayers, excludedPids]);

  // Account-independent backup — a plain JSON file saved to the user's own
  // computer, with no dependency on Google Sheets or even this Google account.
  // Captures every field on every recruit currently shown (real Targets
  // included, flattened to plain records) so restoring it rebuilds the exact
  // same database from scratch under a brand-new account if this one is ever
  // lost. Uses combinedPlayers directly — already the full, current, merged
  // view — rather than re-deriving a subset.
  const handleExportJson = async () => {
    const result = await downloadRecruitingDatabaseJson(combinedPlayers);
    if (result === 'saved') toast.success('Recruiting Database exported.');
  };

  const jsonFileInputRef = useRef(null);
  // restoringJson: reading/parsing the picked file. pendingJsonOverwrite: a
  // successfully-parsed backup awaiting the user's explicit confirmation,
  // since this REPLACES the database entirely rather than merging into it.
  // confirmingJsonOverwrite: the actual write is in flight.
  const [restoringJson, setRestoringJson] = useState(false);
  const [pendingJsonOverwrite, setPendingJsonOverwrite] = useState(null);
  const [confirmingJsonOverwrite, setConfirmingJsonOverwrite] = useState(false);

  // The header toolbar (Add/Batch Edit/Export/Restore/Help) now renders in
  // Recruiting.jsx's own hero — this ref bridges those buttons to this
  // component's local modal state, same pattern as ScoutAnalysis's actionsRef.
  if (actionsRef) {
    actionsRef.current.openAdd = () => setShowImportModal(true);
    actionsRef.current.openBatchEdit = () => setShowBatchEditModal(true);
    actionsRef.current.exportJson = handleExportJson;
    actionsRef.current.restoreJson = () => jsonFileInputRef.current?.click();
    actionsRef.current.openHelp = () => setShowHelpPanel(true);
  }
  useEffect(() => { onReady?.({ restoringJson }); }, [restoringJson]);

  const handleJsonFileSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !currentDynasty) return;
    setRestoringJson(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error('Not a valid Recruiting Database backup file.');
      if (!parsed.length) throw new Error('That backup file has no recruits in it.');

      // Export captures combinedPlayers — real Targets/sibling-scouted
      // recruits (the `players` prop — the SAME scoped set combinedPlayers'
      // own basePlayers uses, NOT the full dynasty.players roster, which has
      // its own unrelated pid range that would false-match almost anything
      // here) AND actual recruitingDatabasePlayers entries, flattened
      // together with no tag distinguishing which is which. Only the
      // database-only ones actually belong back in recruitingDatabasePlayers:
      // a real Target is already tracked via `players`, so writing it here
      // TOO makes it show up twice (once as itself, once as this "restored
      // copy") the moment combinedPlayers merges them back in. Excluding
      // anything whose pid matches a CURRENT real Target is what a true
      // "replace, don't duplicate" restore requires.
      const targetPidSet = new Set(
        (players || []).filter(p => p.pid != null).map(p => String(p.pid))
      );
      const databaseOnly = parsed.filter(p => p.pid == null || !targetPidSet.has(String(p.pid)));
      const skippedTargetCount = parsed.length - databaseOnly.length;

      // Renumber to fresh pids — the file's own pids have no guaranteed
      // relationship to this dynasty's current state, so reusing them as-is
      // risks colliding with each other. Starting past every pid a CURRENT
      // real Target uses (not just 1) additionally guarantees none of these
      // fresh pids can ever coincidentally match a real Target's own pid —
      // that exact coincidence is what silently dropped or double-counted
      // entries the last time this used a plain 1..N renumber.
      const usedTargetPids = [...targetPidSet].map(Number).filter(Number.isFinite);
      let nextPid = Math.max(0, ...usedTargetPids) + 1;
      const finalPlayers = databaseOnly.map(p => {
        const { _mergedFromDynastyId, _mergedFromDynastyName, ...rest } = p;
        return { ...rest, pid: nextPid++ };
      });

      setPendingJsonOverwrite({ recruits: finalPlayers, addedCount: finalPlayers.length, skippedTargetCount });
    } catch (error) {
      console.error('Recruiting Database restore error:', error);
      toast.error(error?.message || 'Could not read that file — make sure it\'s a Recruiting Database export.');
    } finally {
      setRestoringJson(false);
    }
  };

  // This is a COMPLETE OVERWRITE, not a merge — whatever's currently in
  // recruitingDatabasePlayers is entirely replaced by the file's contents.
  // Confirmed explicitly (see the ConfirmModal below) since it's destructive
  // and can't be undone short of restoring an even older backup.
  const handleConfirmJsonOverwrite = async () => {
    if (!pendingJsonOverwrite || !currentDynasty) return;
    setConfirmingJsonOverwrite(true);
    try {
      await updateRecruitingDatabasePlayers(currentDynasty.id, pendingJsonOverwrite.recruits);
      const n = pendingJsonOverwrite.addedCount;
      toast.success(`Database replaced — ${n} recruit${n === 1 ? '' : 's'} restored from backup.`);
      setPendingJsonOverwrite(null);
    } catch (error) {
      console.error('Recruiting Database restore error:', error);
      toast.error('Failed to restore. Please try again.');
    } finally {
      setConfirmingJsonOverwrite(false);
    }
  };

  // Edits/deletes on a database-only recruit must stay inside
  // recruitingDatabasePlayers — never fall through to onEdit/onDelete, which
  // operate on dynasty.players/isTarget and would be the exact leak this
  // feature is designed to avoid.
  const isFromRecruitingDatabase = (pl) =>
    pl?.pid != null && recruitingDatabasePlayers.some(p => String(p.pid) === String(pl.pid));

  // A manual "Recent #" move. Rank is always RE-DERIVED from scoutedAt (see
  // computeRecentRanks), never stored, so the only way to make a typed
  // position stick is to rewrite scoutedAt across the WHOLE combined list in
  // its new order (reorderByRecentRank) — this deliberately overwrites every
  // OTHER recruit's scoutedAt too, not just the moved one, same tradeoff as a
  // drag reorder. The edited recruit's normal field edits still go through
  // whichever path it already belongs to (onEdit for a real Target, straight
  // into recruitingDatabasePlayers otherwise); everyone else displaced by the
  // move gets ONE extra batched write per array, never one write per player.
  const handleRecentRankEdit = async (updatedFields, original, desiredRank) => {
    const reordered = reorderByRecentRank(combinedPlayers, original.pid, desiredRank);
    if (!reordered) return false;
    const scoutedAtByPid = new Map(reordered.map(r => [String(r.pid), r.scoutedAt]));
    const editedIsDbOnly = isFromRecruitingDatabase(original);

    try {
      if (editedIsDbOnly) {
        const nextDb = recruitingDatabasePlayers.map(p => {
          const scoutedAt = scoutedAtByPid.get(String(p.pid));
          if (String(p.pid) === String(original.pid)) {
            return { ...p, ...updatedFields, scoutedAt: scoutedAt ?? p.scoutedAt, updatedAt: Date.now() };
          }
          return scoutedAt != null ? { ...p, scoutedAt } : p;
        });
        await updateRecruitingDatabasePlayers(currentDynasty.id, nextDb);
      } else {
        if (!onEdit) return false;
        const ok = await onEdit({ ...updatedFields, scoutedAt: scoutedAtByPid.get(String(original.pid)) }, original);
        if (ok === false) return false;

        const nextDb = recruitingDatabasePlayers.map(p => {
          const scoutedAt = scoutedAtByPid.get(String(p.pid));
          return scoutedAt != null ? { ...p, scoutedAt } : p;
        });
        if (nextDb.some((p, i) => p !== recruitingDatabasePlayers[i])) {
          await updateRecruitingDatabasePlayers(currentDynasty.id, nextDb);
        }
      }

      const rawPlayers = currentDynasty?.players || [];
      const nextPlayers = rawPlayers.map(p => {
        if (String(p.pid) === String(original.pid)) return p; // handled via onEdit above, if applicable
        const scoutedAt = scoutedAtByPid.get(String(p.pid));
        return scoutedAt != null ? { ...p, scoutedAt } : p;
      });
      if (nextPlayers.some((p, i) => p !== rawPlayers[i])) {
        await updateDynasty(currentDynasty.id, { players: nextPlayers });
      }
      return true;
    } catch (error) {
      console.error('Recent # reorder failed:', error);
      toast.error('Failed to reorder. Please try again.');
      return false;
    }
  };

  // Must be async and must return/await the underlying write — EditModal's
  // own handleSave does `const ok = await onSave(updated); if (ok !== false)
  // onClose()`. A version that fires the write and returns undefined
  // synchronously (the previous bug here) makes the modal think every save
  // succeeded and close immediately, whether or not anything actually
  // persisted or a write error was silently swallowed.
  const handleEditSave = async (updated, original) => {
    const { _desiredRecentRank, ...updatedFields } = updated;
    if (_desiredRecentRank != null && Number(_desiredRecentRank) !== original.recentRank) {
      return await handleRecentRankEdit(updatedFields, original, Number(_desiredRecentRank));
    }

    if (isFromRecruitingDatabase(original)) {
      try {
        const next = recruitingDatabasePlayers.map(p => String(p.pid) === String(original.pid) ? { ...updatedFields, updatedAt: Date.now() } : p);
        await updateRecruitingDatabasePlayers(currentDynasty.id, next);
        return true;
      } catch (error) {
        console.error('Recruiting Database edit save error:', error);
        toast.error('Failed to save your edit. Please try again.');
        return false;
      }
    }
    if (!onEdit) return false;
    return await onEdit(updatedFields, original);
  };

  const handleDelete = async (pl) => {
    if (isFromRecruitingDatabase(pl)) {
      try {
        const next = recruitingDatabasePlayers.filter(p => String(p.pid) !== String(pl.pid));
        await updateRecruitingDatabasePlayers(currentDynasty.id, next);
      } catch (error) {
        console.error('Recruiting Database delete error:', error);
        toast.error('Failed to delete. Please try again.');
      }
      return;
    }
    onDelete && onDelete(pl);
  };

  // Batch-edit save: deliberately NOT "call handleEditSave/handleDelete once
  // per changed row." Both of those close over THIS render's
  // recruitingDatabasePlayers snapshot — calling either of them N times in a
  // loop (for N changed database-only rows) would have every call compute
  // its own "next array" from that SAME stale snapshot, so only the LAST of N
  // changes would actually survive the round trip. Instead, every database-
  // only edit/delete in the batch is folded into ONE array + ONE
  // updateDynasty call. Real-Target edits (routed through onEdit ->
  // updatePlayer) don't have that problem — updatePlayer re-reads the
  // dynasty fresh on every call — so those are simply looped, sequentially
  // awaited so each one sees the previous one's write.
  const handleBatchSave = async ({ changedRows, deletedPids, rankMoves }) => {
    const dbOnlyChanges = new Map();
    const targetChanges = [];
    for (const { original, updated } of changedRows || []) {
      if (isFromRecruitingDatabase(original)) {
        dbOnlyChanges.set(String(original.pid), { ...updated, updatedAt: Date.now() });
      } else {
        targetChanges.push({ original, updated });
      }
    }

    // "Delete" means two different things depending on where the recruit
    // lives: a recruitingDatabasePlayers entry is removed outright — gone for
    // good. A real Target/sibling-scouted player has no delete path anywhere
    // in this app today (removing one is a bigger action, tied to the actual
    // Targets/Commitments/roster system, than this reference view should
    // trigger) — so it's added to recruitingDatabaseExcludedPids instead,
    // which hides it from the Recruiting Database view only. The real
    // Target/roster record, and everything downstream of it, is untouched.
    const dbOnlyDeletePids = new Set();
    const excludePids = new Set();
    for (const pid of deletedPids || []) {
      if (isFromRecruitingDatabase({ pid })) dbOnlyDeletePids.add(String(pid));
      else excludePids.add(String(pid));
    }

    // Recent # moves: applied sequentially against an evolving working copy
    // of the full combined order (reorderByRecentRank re-sorts by whatever
    // recentRank it's handed, so each move needs to see the PREVIOUS move's
    // result, not the stale render's ranks) — same "move a card, everyone in
    // between shifts by one" semantics as the single-row Edit modal, just
    // repeated once per moved row. scoutedAtByPid ends up holding the FINAL
    // scoutedAt for every recruit touched by ANY move.
    const scoutedAtByPid = new Map();
    if (rankMoves?.length) {
      let workingList = combinedPlayers.map(p => ({ pid: p.pid, recentRank: p.recentRank, scoutedAt: p.scoutedAt }));
      for (const { pid, desiredRank } of rankMoves) {
        const reordered = reorderByRecentRank(workingList, pid, desiredRank);
        if (!reordered) continue;
        workingList = reordered.map((r, i) => ({ pid: r.pid, scoutedAt: r.scoutedAt, recentRank: i + 1 }));
        reordered.forEach(r => scoutedAtByPid.set(String(r.pid), r.scoutedAt));
      }
    }

    if (dbOnlyChanges.size || dbOnlyDeletePids.size || scoutedAtByPid.size) {
      const next = recruitingDatabasePlayers
        .filter(p => !dbOnlyDeletePids.has(String(p.pid)))
        .map(p => {
          const changed = dbOnlyChanges.get(String(p.pid));
          const scoutedAt = scoutedAtByPid.get(String(p.pid));
          if (changed) return scoutedAt != null ? { ...changed, scoutedAt } : changed;
          return scoutedAt != null ? { ...p, scoutedAt } : p;
        });
      await updateRecruitingDatabasePlayers(currentDynasty.id, next);
    }
    if (excludePids.size) {
      // Tiny id list, not part of the size problem recruitingDatabasePlayers
      // was — stays on the main doc via the ordinary updateDynasty path.
      const nextExcluded = Array.from(new Set([
        ...(currentDynasty.recruitingDatabaseExcludedPids || []),
        ...excludePids,
      ]));
      await updateDynasty(currentDynasty.id, { recruitingDatabaseExcludedPids: nextExcluded });
    }

    for (const { original, updated } of targetChanges) {
      if (!onEdit) continue;
      const scoutedAt = scoutedAtByPid.get(String(original.pid));
      await onEdit(scoutedAt != null ? { ...updated, scoutedAt } : updated, original);
    }

    // Real Targets whose scoutedAt shifted but had no OTHER field edit (so
    // they never went through onEdit above) — one combined dynasty.players
    // write covers all of them, instead of one write per shifted player.
    if (scoutedAtByPid.size) {
      const targetChangedPids = new Set(targetChanges.map(({ original }) => String(original.pid)));
      const rawPlayers = currentDynasty?.players || [];
      const nextPlayers = rawPlayers.map(p => {
        if (targetChangedPids.has(String(p.pid))) return p; // already written via onEdit above
        const scoutedAt = scoutedAtByPid.get(String(p.pid));
        return scoutedAt != null ? { ...p, scoutedAt } : p;
      });
      if (nextPlayers.some((p, i) => p !== rawPlayers[i])) {
        await updateDynasty(currentDynasty.id, { players: nextPlayers });
      }
    }
  };

  useEffect(() => {
    async function loadScout() {
      const img  = await getStaffData('scout_img');
      const name = await getStaffData('scout_name');
      if (img)  setScoutImg(img);
      if (name) setScoutName(name);
    }
    loadScout();
  }, []);

  // Surface a specific player when navigated here via a link (e.g. Recently
  // Filed, Actively Targeting, Removed) — drop their name into the search bar
  // so the table filters straight down to them, rather than popping their
  // report open unasked.
  useEffect(() => {
    if (!highlightPid || !combinedPlayers.length) return;
    const match = combinedPlayers.find(pl => String(pl.pid) === String(highlightPid));
    if (match) {
      setSearchQuery(match.name);
      // Slight delay so the row ref is rendered before we scroll
      setTimeout(() => {
        const el = rowRefs.current[highlightPid];
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    }
  }, [highlightPid, combinedPlayers]);

  const positionsList = ['ALL', 'QB', 'HB', 'FB', 'WR', 'TE', 'OT', 'OG', 'C', 'DE', 'DT', 'OLB', 'MIKE', 'CB', 'FS', 'SS', 'ATH', 'K', 'P'];

  // Revealed-devTrait HS recruit pool — nudges archetype grading toward what
  // actually separates Elite/Star/Impact/Normal once enough data exists.
  const pool = useMemo(() => buildRevealedPool(combinedPlayers), [combinedPlayers]);
  const weightsMap = useMemo(() => buildAttributeQualityMap(pool, combinedPlayers), [pool, combinedPlayers]);

  const filteredPlayers = combinedPlayers.filter(p => {
    const matchesPos = filterPos === 'ALL' || p.position === filterPos;
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          p.archetype.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesPos && matchesSearch;
  });

  const DEV_ORDER = { Elite: 5, Star: 4, Impact: 3, Normal: 2, Hidden: 1, '': 1 };
  const toggleSort = key => setSortConfig(prev => ({
    key,
    dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc',
  }));

  const sortedPlayers = [...filteredPlayers].sort((a, b) => {
    let av, bv;
    switch (sortConfig.key) {
      case 'recency':   av = a.recentRank ?? a.addedIndex ?? 0;             bv = b.recentRank ?? b.addedIndex ?? 0;            break;
      case 'name':      av = a.name;                                       bv = b.name;                                       break;
      case 'score': {
        // Ungraded (computeScore returns null) always sinks to the bottom of
        // the list, regardless of sort direction — there's no meaningful
        // position to give a "-" among real numeric grades.
        const asRaw = computeScore(a, weightsMap, pool);
        const bsRaw = computeScore(b, weightsMap, pool);
        if (asRaw == null && bsRaw == null) return 0;
        if (asRaw == null) return 1;
        if (bsRaw == null) return -1;
        av = asRaw; bv = bsRaw;
        break;
      }
      case 'group':     av = a.group;                                      bv = b.group;                                      break;
      case 'position':  av = a.position;                                   bv = b.position;                                   break;
      case 'archetype': av = a.archetype;                                  bv = b.archetype;                                  break;
      case 'stars':     av = parseInt(a.stars);                            bv = parseInt(b.stars);                            break;
      case 'dev':       av = DEV_ORDER[a.devTrait] ?? 1;                   bv = DEV_ORDER[b.devTrait] ?? 1;                   break;
      case 'gpa': {
        // Not-yet-scouted (no GPA at all) always sinks to the bottom,
        // same convention as the 'score' sort above.
        const aScouted = hasScoutedAttributes(a);
        const bScouted = hasScoutedAttributes(b);
        if (!aScouted && !bScouted) return 0;
        if (!aScouted) return 1;
        if (!bScouted) return -1;
        av = parseFloat(generateAcademic(a).gpa); bv = parseFloat(generateAcademic(b).gpa);
        break;
      }
      default: return 0;
    }
    if (av < bv) return sortConfig.dir === 'asc' ? -1 : 1;
    if (av > bv) return sortConfig.dir === 'asc' ? 1 : -1;
    return 0;
  });

  const SortTh = ({ sortKey, children, className = '' }) => {
    const active = sortConfig.key === sortKey;
    return (
      <th
        className={`px-2 py-3.5 cursor-pointer select-none hover:text-white transition-colors overflow-hidden ${className}`}
        onClick={() => toggleSort(sortKey)}
      >
        <span className="inline-flex items-center gap-1 max-w-full overflow-hidden whitespace-nowrap">
          <span className="truncate">{children}</span>
          <span className="text-[8px] opacity-60 shrink-0">
            {active ? (sortConfig.dir === 'desc' ? '▼' : '▲') : '⇅'}
          </span>
        </span>
      </th>
    );
  };

  return (
    <div className="space-y-4">
      {editingPlayer && (
        <EditModal
          player={editingPlayer}
          pool={pool}
          weightsMap={weightsMap}
          maxRank={combinedPlayers.length}
          onSave={updated => handleEditSave(updated, editingPlayer)}
          onClose={() => setEditingPlayer(null)}
          onDelete={(onDelete || isFromRecruitingDatabase(editingPlayer)) ? (() => handleDelete(editingPlayer)) : null}
        />
      )}
      <AuthErrorModal isOpen={auth.showAuthError} onClose={auth.closeAuthError} onRefresh={auth.retry} />
      <RecruitingDatabaseImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        dynasty={currentDynasty}
      />
      <RecruitingDatabaseBatchEditModal
        isOpen={showBatchEditModal}
        onClose={() => setShowBatchEditModal(false)}
        players={combinedPlayers}
        isFromRecruitingDatabase={isFromRecruitingDatabase}
        onSaveBatch={handleBatchSave}
      />
      {pendingJsonOverwrite && (
        <ConfirmModal
          isOpen
          onClose={() => setPendingJsonOverwrite(null)}
          onConfirm={handleConfirmJsonOverwrite}
          title="Replace your Recruiting Database?"
          message={
            `This will completely replace your current database (${recruitingDatabasePlayers.length} recruit${recruitingDatabasePlayers.length === 1 ? '' : 's'}) with the ${pendingJsonOverwrite.addedCount} recruit${pendingJsonOverwrite.addedCount === 1 ? '' : 's'} from this file. Anything currently in your database that isn't in the file will be gone. This cannot be undone.`
            + (pendingJsonOverwrite.skippedTargetCount > 0
              ? ` (${pendingJsonOverwrite.skippedTargetCount} recruit${pendingJsonOverwrite.skippedTargetCount === 1 ? '' : 's'} in the file already exist as real Targets on your roster/board — those are left alone, not duplicated.)`
              : '')
          }
          confirmText="Replace Database"
          cancelText="Cancel"
          loading={confirmingJsonOverwrite}
        />
      )}
      {/* The header toolbar (Add/Batch Edit/Export/Restore/Help) now renders
          in Recruiting.jsx's own hero — see the actionsRef wiring above.
          The hidden file input stays here since the ref-triggered click
          needs the actual DOM node. */}
      {currentDynasty && (
        <input
          ref={jsonFileInputRef}
          type="file"
          accept=".json"
          onChange={handleJsonFileSelected}
          className="hidden"
        />
      )}

      {/* Help — a real modal (portaled to document.body) instead of an
          anchored dropdown, so it can never get clipped by this header's
          own overflow-hidden (that clipping was the original bug). */}
      <Modal isOpen={showHelpPanel} onClose={() => setShowHelpPanel(false)} title="Recruiting Database" size="sm">
        <div className="space-y-2 text-xs text-txt-secondary leading-relaxed">
          <p>
            A scouting reference for every recruit you've scouted in this dynasty —
            separate from the real Targets board.
          </p>
          <p>
            <strong className="text-txt-primary">Add</strong> opens the paste/import panel
            to add recruits (AI-fill supported) — no Google account needed.
          </p>
          <p>
            <strong className="text-txt-primary">Batch Edit</strong> opens every recruit
            currently shown in one big editable grid — fix many at once, all without
            opening each one individually. Deleting a real Target there just hides it
            from this view (your actual Target/roster record is untouched); deleting an
            imported-only prospect removes it for good.
          </p>
          <p>
            <strong className="text-txt-primary">Export JSON</strong> downloads a full backup
            file. <strong className="text-txt-primary">Restore from JSON</strong> loads one
            back in — this COMPLETELY REPLACES your current database with the file's
            contents, it does not merge.
          </p>
          <p className="text-[10px] text-txt-tertiary leading-relaxed pt-2 border-t border-surface-4">
            This database belongs to this dynasty only — it doesn't carry over to your
            other dynasties automatically. Use Export JSON / Restore from JSON to bring it
            into a new one.
          </p>
        </div>
      </Modal>

      {/* Search + position filters — full width now that the Staff page
          (and its portrait slots) has been removed. */}
      <div className="rounded-xl p-3.5 space-y-2.5 bg-surface-2 border border-surface-4">
        <input
          type="text"
          placeholder="Search prospect name or archetype..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full rounded-lg text-xs p-2.5 text-txt-primary placeholder-txt-tertiary bg-surface-3 border border-surface-4 focus:outline-none focus:border-surface-5 transition"
        />
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[8px] font-semibold uppercase tracking-widest text-txt-tertiary flex-shrink-0">Pos:</span>
          {positionsList.map(pos => (
            <button
              key={pos}
              onClick={() => setFilterPos(pos)}
              className={`text-[9px] font-bold px-2 py-0.5 rounded transition uppercase tracking-wider ${filterPos === pos ? '' : 'text-txt-tertiary border border-surface-4 hover:bg-surface-3'}`}
              style={filterPos === pos ? { background: p, color: '#fff' } : undefined}
            >
              {recruitingPosLabel(pos)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden bg-surface-2 border border-surface-4">
        {/* Percentage-based columns let a narrow/zoomed viewport shrink the
            Attributes column below what "XXX:99" pills need to render, and
            `truncate` doesn't just clip the label in that case — it can eat
            the rating value itself (e.g. "AWR:72" collapsing to "AWR…" with
            no number at all). Fixed px widths give every column a real floor,
            and overflow-x-auto (instead of overflow-hidden) lets the table
            scroll horizontally rather than squeeze below that floor. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1060px] table-fixed text-left border-collapse">
            <colgroup>
              <col style={{ width: '70px' }} />
              <col style={{ width: '130px' }} />
              <col style={{ width: '80px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '70px' }} />
              <col style={{ width: '150px' }} />
              <col style={{ width: '70px' }} />
              <col style={{ width: '90px' }} />
              <col style={{ width: '60px' }} />
              <col style={{ width: '190px' }} />
              <col style={{ width: '50px' }} />
            </colgroup>
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-widest text-txt-tertiary bg-surface-3 border-b border-surface-4">
                <SortTh sortKey="recency">Recent</SortTh>
                <SortTh sortKey="name">Prospect</SortTh>
                <SortTh sortKey="score" className="text-center">Grade</SortTh>
                <SortTh sortKey="group">Group</SortTh>
                <SortTh sortKey="position">Pos</SortTh>
                <SortTh sortKey="archetype">Archetype</SortTh>
                <SortTh sortKey="stars" className="text-center">Stars</SortTh>
                <SortTh sortKey="dev">Dev</SortTh>
                <SortTh sortKey="gpa" className="text-center">GPA</SortTh>
                <th className="px-2 py-3.5 text-slate-500">Attributes</th>
                <th className="px-2 py-3.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-4 text-xs">
              {filteredPlayers.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-12 text-center text-txt-tertiary text-xs">
                    {combinedPlayers.length === 0
                      ? 'No scouting logs found. Add freshman targets via the Recruiting page.'
                      : 'No prospects matching active filters.'}
                  </td>
                </tr>
              ) : (
                sortedPlayers.map((pl, i) => {
                  const score = computeScore(pl, weightsMap, pool);
                  const tier  = getGradeTier(score);
                  const scouted = hasScoutedAttributes(pl);
                  const gpa = scouted ? generateAcademic(pl).gpa : null;
                  const hiddenDev = isHiddenDev(pl.devTrait);
                  const formOrder = getFormAttrs(pl.position, pl.archetype);
                  const plAttributes = pl.attributes || {};
                  const orderedAttrs = formOrder.length
                    ? [
                        ...formOrder.filter(k => plAttributes[k] != null).map(k => [k, plAttributes[k]]),
                        ...Object.entries(plAttributes).filter(([k, v]) => !formOrder.includes(k) && v != null),
                      ]
                    : Object.entries(plAttributes).filter(([, v]) => v != null);
                  const isOpen = openPid != null && String(openPid) === String(pl.pid);
                  return (
                    <React.Fragment key={i}>
                    <tr
                      ref={el => { if (el) rowRefs.current[pl.pid] = el; }}
                      onClick={() => setOpenPid(cur => (String(cur) === String(pl.pid) ? null : pl.pid))}
                      className={`transition group cursor-pointer border-b border-surface-4 hover:bg-surface-3 ${isOpen || String(pl.pid) === String(highlightPid) ? 'bg-surface-3' : ''}`}
                    >
                      <td className="px-2 py-3.5 text-center text-[10px] tabular-nums text-txt-tertiary overflow-hidden">{pl.recentRank ?? (pl.addedIndex != null ? pl.addedIndex + 1 : '—')}</td>
                      <td className="px-2 py-3.5 font-semibold text-txt-secondary group-hover:text-txt-primary transition overflow-hidden">
                        <ProspectName name={pl.name} gemBust={pl.gemBust} />
                      </td>
                      <td className="px-2 py-3.5 text-center overflow-hidden">
                        <div className="inline-flex flex-col items-center gap-0.5">
                          <span className={`font-black tracking-wide text-xs px-2 py-0.5 rounded border ${tier.badgeCls}`}>{tier.grade}</span>
                          {score != null && <span className="text-[9px] tabular-nums text-slate-600">{score.toFixed(1)}</span>}
                        </div>
                      </td>
                      <td className="px-2 py-3.5 uppercase font-semibold text-txt-tertiary text-[10px] tracking-wider overflow-hidden truncate">{pl.group}</td>
                      <td className="px-2 py-3.5 overflow-hidden">
                        <span className="px-2 py-0.5 rounded text-[10px] font-black text-txt-tertiary bg-surface-4 border border-surface-4">
                          {recruitingPosLabel(pl.rawPosition ?? pl.position)}
                        </span>
                      </td>
                      <td className="px-2 py-3.5 text-txt-secondary font-medium overflow-hidden">{pl.archetype}</td>
                      <td className="px-2 py-3.5 text-center font-black text-amber-400 tracking-wide overflow-hidden">{pl.stars}★</td>
                      <td className="px-2 py-3.5 overflow-hidden" onClick={e => e.stopPropagation()}>
                        {editingDevFor === pl ? (
                          <select
                            autoFocus
                            defaultValue={pl.devTrait || 'Hidden'}
                            onChange={e => { onEdit && onEdit({ ...pl, devTrait: e.target.value }, pl); setEditingDevFor(null); }}
                            onBlur={() => setEditingDevFor(null)}
                            className="bg-slate-900 border border-emerald-600 text-[10px] font-bold text-white rounded px-1.5 py-0.5 focus:outline-none cursor-pointer"
                          >
                            {DEV_TRAITS.map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                        ) : (
                          <span
                            onClick={() => setEditingDevFor(pl)}
                            title="Click to update dev trait"
                            className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer hover:ring-1 hover:ring-emerald-600/60 transition ${
                              pl.devTrait === 'Elite'  ? 'bg-surface-3 border border-[#0E7A2A] text-[#22E065]' :
                              pl.devTrait === 'Star'   ? 'bg-surface-3 border border-[#9C7209] text-[#FFD100]' :
                              pl.devTrait === 'Impact' ? 'bg-surface-3 border border-[#7C8991] text-[#D6DEE2]' :
                              pl.devTrait === 'Normal' ? 'bg-surface-3 border border-[#8C5524] text-[#CD7F32]' :
                                                         'bg-slate-950 border border-slate-700 text-slate-600 italic'
                            }`}>
                            {hiddenDev ? 'HIDDEN' : pl.devTrait.toUpperCase()}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-3.5 text-center overflow-hidden">
                        {scouted
                          ? <span className="text-xs font-bold text-txt-tertiary">{gpa}</span>
                          : <span className="text-[9px] italic text-slate-600" title="No attributes entered yet">Not Scouted</span>}
                      </td>
                      <td className="px-2 py-3.5 tabular-nums text-[10px] text-txt-tertiary overflow-hidden">
                        {/* Same first-half/second-half column split as the Edit
                            modal — NOT a row-major grid (which would zigzag
                            attrs 1&2, 3&4, ... across the two columns instead
                            of grouping 1-5 and 6-10 together). */}
                        {orderedAttrs.length === 0 ? (
                          <span className="text-[9px] italic text-slate-600">Not Scouted</span>
                        ) : (
                          <div className="grid grid-cols-2 gap-1 min-w-0">
                            {(() => {
                              const half = Math.ceil(orderedAttrs.length / 2);
                              return [orderedAttrs.slice(0, half), orderedAttrs.slice(half)];
                            })().map((col, colIdx) => (
                              <div key={colIdx} className="space-y-1 min-w-0">
                                {col.map(([key, val]) => (
                                  // If space ever runs out, the label (flex-1 min-w-0)
                                  // truncates first — the value (flex-shrink-0) is
                                  // never the part that gets cut off. min-w-0 + w-full
                                  // on the pill itself is required too — without it,
                                  // some browsers (Safari in particular) size a flex
                                  // container to its content's min-content width
                                  // instead of the grid track, letting a wide pill
                                  // spill into the next column despite overflow-hidden.
                                  <span key={key} title={key} className="flex items-baseline w-full min-w-0 px-1 py-0.5 rounded text-txt-secondary bg-surface-3 border border-surface-4 overflow-hidden">
                                    <strong className="text-txt-tertiary font-normal truncate min-w-0 flex-1">{ATTRIBUTE_ABBR[key] || key}:</strong>
                                    <span className="flex-shrink-0">{val}</span>
                                  </span>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-1 text-center overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1 justify-center opacity-0 group-hover:opacity-100 transition">
                          {onEdit && (
                            <button onClick={() => setEditingPlayer(pl)} className="p-1.5 rounded text-slate-600 hover:text-txt-primary hover:bg-surface-3 transition" title="Edit prospect">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-surface-4 bg-surface-2">
                        <td colSpan={11} className="p-4">
                          <GradeReportContent player={pl} allPlayers={combinedPlayers} weightsMap={weightsMap} pool={pool} wide />
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
