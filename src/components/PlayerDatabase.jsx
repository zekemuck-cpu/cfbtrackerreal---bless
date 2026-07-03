import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createStaffAccessor } from './staffDB';
import { archetypeBaseScore } from './archetypeWeights';
import { buildRevealedPool, buildWeightsMap, predictDevTrait, getFormAttrs } from '../utils/devTraitLearning';
import { ATTRIBUTE_ABBR } from '../utils/recruitAttributes';
import { OPTIONS_REGISTRY } from './ScoutingReport';
import GemBustIcon from './GemBustIcon';
import { useDynasty } from '../context/DynastyContext';
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler';
import AuthErrorModal from './AuthErrorModal';
import { createRecruitingDatabaseSheet, readRecruitingDatabaseSheet, writeRecruitingDatabaseRows, sheetExists, sheetHasRecruitingDatabaseTab } from '../services/sheetsService';
import { mergeRecruitingDatabaseRows, reconcileRecruitingDatabaseSync, snapshotKey } from '../utils/recruitingDatabaseSync';
import { useToast } from './ui/Toast';
import { useConfirm } from './ui/ConfirmDialog';

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
const GRADE_TIERS = [
  { grade: 'A+', min: 95, badgeCls: 'bg-surface-3 border-[#0F9D3E] text-[#3DFF7F]' },
  { grade: 'A',  min: 90, badgeCls: 'bg-surface-3 border-[#0E7A2A] text-[#22E065]' },
  { grade: 'A-', min: 86, badgeCls: 'bg-surface-3 border-[#0B6420] text-[#17C454]' },
  { grade: 'B+', min: 82, badgeCls: 'bg-surface-3 border-[#B8860B] text-[#FFDD33]' },
  { grade: 'B',  min: 78, badgeCls: 'bg-surface-3 border-[#9C7209] text-[#FFD100]' },
  { grade: 'B-', min: 74, badgeCls: 'bg-surface-3 border-[#7A5C08] text-[#E8B923]' },
  { grade: 'C+', min: 70, badgeCls: 'bg-surface-3 border-[#9BA7AF] text-[#F0F5F7]' },
  { grade: 'C',  min: 66, badgeCls: 'bg-surface-3 border-[#7C8991] text-[#D6DEE2]' },
  { grade: 'C-', min: 62, badgeCls: 'bg-surface-3 border-[#606B73] text-[#AEB7BC]' },
  { grade: 'D+', min: 58, badgeCls: 'bg-surface-3 border-[#B35900] text-[#FF9F40]' },
  { grade: 'D',  min: 54, badgeCls: 'bg-surface-3 border-[#8C5524] text-[#CD7F32]' },
  { grade: 'D-', min: 50, badgeCls: 'bg-surface-3 border-[#7A4210] text-[#C86A1E]' },
  { grade: 'F',  min: 0,  badgeCls: 'bg-surface-3 border-[#8C5524] text-[#CD7F32]' },
];

// ── Grading constants ────────────────────────────────────────────────────────
// Dev trait is the single most important factor. Normal dev players rarely
// develop enough to compete at high-level programs; Elite are unicorn recruits.
const DEV_BONUS  = { Elite: 20, Star: 10, Impact: 5, Normal: -10 };
const STAR_BONUS = { '5': 3, '4': 2, '3': 1, '2': 0, '1': -1 };

function isHiddenDev(devTrait) {
  return !devTrait || devTrait === 'Hidden' || devTrait === 'hidden' || devTrait === '';
}
function getDevBonus(devTrait) {
  if (isHiddenDev(devTrait)) return 0;
  return DEV_BONUS[devTrait] ?? 0;
}

// Top 5 most critical attributes per position (weighted 2× vs the rest)
const PRIORITY_ATTRS = {
  QB:   ['Throw Power', 'Short Accuracy', 'Medium Accuracy', 'Deep Accuracy', 'Under Pressure'],
  HB:   ['Speed', 'Carrying', 'Juke Move', 'Break Tackle', 'BC Vision'],
  WR:   ['Speed', 'Catching', 'Catch In Traffic', 'Short Route', 'Medium Route'],
  TE:   ['Catching', 'Catch In Traffic', 'Run Block', 'Pass Block', 'Speed'],
  OT:   ['Pass Block', 'Run Block', 'Pass Block Power', 'Run Block Power', 'Pass Block Finesse'],
  OG:   ['Run Block', 'Pass Block', 'Run Block Power', 'Run Block Finesse', 'Pass Block Finesse'],
  C:    ['Run Block', 'Pass Block', 'Run Block Power', 'Pass Block Finesse', 'Awareness'],
  DE:   ['Block Shedding', 'Power Moves', 'Finesse Moves', 'Speed', 'Pursuit'],
  DT:   ['Block Shedding', 'Power Moves', 'Strength', 'Tackle', 'Pursuit'],
  OLB:  ['Play Recognition', 'Tackle', 'Man Coverage', 'Zone Coverage', 'Pursuit'],
  MIKE: ['Play Recognition', 'Tackle', 'Hit Power', 'Zone Coverage', 'Strength'],
  CB:   ['Man Coverage', 'Zone Coverage', 'Speed', 'Press', 'Change of Direction'],
  FS:   ['Zone Coverage', 'Man Coverage', 'Speed', 'Play Recognition', 'Catching'],
  SS:   ['Man Coverage', 'Tackle', 'Hit Power', 'Zone Coverage', 'Speed'],
  ATH:  ['Speed', 'Acceleration', 'Agility', 'Catching', 'Tackle'],
  FB:   ['Lead Block', 'Run Block', 'Trucking', 'Break Tackle', 'Carrying'],
  K:    ['Kick Power', 'Kick Accuracy', 'Awareness'],
  P:    ['Kick Power', 'Kick Accuracy', 'Awareness'],
};

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

// Physical traits that can't be coached — carry a bonus weight across all positions
const PHYSICAL_ATTRS     = new Set(['Speed', 'Acceleration', 'Strength', 'Agility', 'Change of Direction']);
const PHYSICAL_ATTRS_ARR = ['Speed', 'Acceleration', 'Strength', 'Agility', 'Change of Direction'];

// ── Scoring engine ───────────────────────────────────────────────────────────
function calcWeightedAvg(player) {
  const attrs = player.attributes;
  const priority = PRIORITY_ATTRS[player.position] ?? [];
  let sum = 0, weight = 0;
  Object.entries(attrs).forEach(([k, v]) => {
    const posW = priority.includes(k) ? 2 : 1;
    const w = PHYSICAL_ATTRS.has(k) ? posW + 0.5 : posW;
    sum += v * w;
    weight += w;
  });
  return weight ? sum / weight : 0;
}

// Bonus for elite physical ceilings — a 98 speed WR is special regardless of technique
function physOutlierBonus(player) {
  let bonus = 0;
  PHYSICAL_ATTRS_ARR.forEach(k => {
    const v = player.attributes[k] ?? 0;
    if (v >= 96) bonus += 5;
    else if (v >= 92) bonus += 2;
    else if (v >= 88) bonus += 0.5;
  });
  return bonus;
}

// When dev is hidden, estimate a positive bonus from star rating + physical ceiling.
// Grade will be confirmed, raised, or lowered when the user fills in the real trait.
function estimateHiddenDev(player) {
  const stars    = parseInt(player.stars) || 3;
  const physMax  = Math.max(0, ...PHYSICAL_ATTRS_ARR.map(k => player.attributes[k] ?? 0));
  const base     = { 5: 13, 4: 7, 3: 3, 2: 0, 1: -3 }[stars] ?? 3;
  const physBump = physMax >= 96 ? 3 : physMax >= 92 ? 1 : 0;
  return base + physBump;
}

function computeScore(player, weightsMap = null) {
  const devBonus  = isHiddenDev(player.devTrait) ? estimateHiddenDev(player) : getDevBonus(player.devTrait);
  const archBase  = archetypeBaseScore(player, weightsMap);
  const base      = archBase !== null ? archBase : calcWeightedAvg(player);
  return base + devBonus + (STAR_BONUS[String(player.stars)] ?? 0) + physOutlierBonus(player);
}

function getGradeTier(score) {
  return GRADE_TIERS.find(t => score >= t.min) ?? GRADE_TIERS[GRADE_TIERS.length - 1];
}

// ── Pool context ─────────────────────────────────────────────────────────────
function getPoolRank(player, allPlayers, weightsMap = null) {
  const group = allPlayers.filter(p => p.position === player.position);
  const sorted = [...group].sort((a, b) => computeScore(b, weightsMap) - computeScore(a, weightsMap));
  const rank = sorted.findIndex(p => p.name === player.name) + 1;
  return { rank, total: group.length };
}

function getPoolAvg(position, allPlayers) {
  const group = allPlayers.filter(p => p.position === position);
  if (!group.length) return null;
  const avg = group.reduce((sum, p) => sum + calcWeightedAvg(p), 0) / group.length;
  return avg.toFixed(1);
}

// ── Combine projections ──────────────────────────────────────────────────────
function generateCombine(player) {
  const h = nameHash(player.name);
  const a = player.attributes;
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

// ── Academic profile ─────────────────────────────────────────────────────────
const MAJORS = [
  'Communications', 'Business Administration', 'Sports Management', 'Criminal Justice',
  'Kinesiology', 'Exercise Science', 'Education', 'Marketing', 'Psychology', 'Sociology',
];

function generateAcademic(player) {
  const h = nameHash(player.name);
  const awareness = player.attributes['Awareness'] ?? 66;
  // Awareness 56 (low) → ~2.30 | Awareness 66 (avg) → ~3.05 | Awareness 76 (high) → ~3.80
  const base = 2.30 + (awareness - 56) * 0.075;
  const gpa = Math.min(4.0, Math.max(2.30, base + seeded(h + 99, -0.15, 0.15)));
  return { gpa: gpa.toFixed(2), major: MAJORS[h % MAJORS.length] };
}

// ── Player quotes — dynamic, attribute-driven responses to scout's question ──
function generateQuote(player) {
  const h = nameHash(player.name);
  const a = player.attributes;
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

// ── Grade analysis text ──────────────────────────────────────────────────────
function buildAnalysisText(player, score, baseAvg, rank, total) {
  const estDev = estimateHiddenDev(player);

  let devLine;
  if (isHiddenDev(player.devTrait)) {
    const estTier = estDev >= 15 ? 'Elite' : estDev >= 9 ? 'Star' : estDev >= 4 ? 'Impact' : estDev >= 0 ? 'Normal-to-Impact' : 'Normal';
    devLine = `Dev trait sealed — projected ${estTier} range based on star rating and athleticism. This grade will be confirmed, raised, or lowered once the trait is revealed.`;
  } else {
    devLine = {
      Elite:  'ELITE development trait. This is a generational prospect — the kind every program in the country is chasing. Expect rapid, exceptional growth well beyond what the raw numbers show.',
      Star:   'Star development trajectory projects significant growth from the current baseline. A high-priority target who will improve substantially with coaching.',
      Impact: 'Impact development track signals above-average upside. Solid contributor who will develop reliably at this position.',
      Normal: 'Normal development trait. These players rarely develop fast enough to contribute at a high-level program. Ceiling is largely what you see now — recruit with that expectation.',
    }[player.devTrait] ?? '';
  }

  // Call out elite physical traits — the eye-test number that can't be coached
  const physMax   = Math.max(0, ...PHYSICAL_ATTRS_ARR.map(k => player.attributes[k] ?? 0));
  const physLabel = PHYSICAL_ATTRS_ARR.find(k => (player.attributes[k] ?? 0) === physMax) ?? 'Speed';
  let physLine = '';
  if (physMax >= 96)      physLine = `Elite-tier ${physLabel} (${physMax}) is a rare athletic ceiling — that kind of raw gift cannot be developed, it can only be found.`;
  else if (physMax >= 92) physLine = `High-end ${physLabel} (${physMax}) gives this prospect a physical ceiling most prospects at this position simply don't have.`;

  let attrLine;
  if (baseAvg >= 85)      attrLine = `Exceptional attribute profile for the ${player.position} position.`;
  else if (baseAvg >= 78) attrLine = `Solid attribute foundation showing clear position competency.`;
  else if (baseAvg >= 70) attrLine = `Average attribute range — key position metrics need development.`;
  else                    attrLine = `Raw prospect; will need significant coaching at ${player.position}.`;

  let poolLine = '';
  if (total > 1) {
    const pct = rank / total;
    if (pct <= 0.25)      poolLine = `Stands out as a top-tier ${player.position} in the current scouting pool.`;
    else if (pct <= 0.50) poolLine = `Above average among the ${player.position} prospects currently on file.`;
    else if (pct <= 0.75) poolLine = `Middle of the pack among scouted ${player.position} prospects.`;
    else                  poolLine = `Below average relative to ${player.position} prospects currently on file.`;
  }

  return [devLine, physLine, attrLine, poolLine].filter(Boolean).join(' ');
}

// ── Grade Breakdown Modal ────────────────────────────────────────────────────
function GradeModal({ player, allPlayers, weightsMap, onClose }) {
  const score      = computeScore(player, weightsMap);
  const baseAvg    = calcWeightedAvg(player);
  const archBase   = archetypeBaseScore(player, weightsMap);
  const displayBase = archBase !== null ? archBase : baseAvg;
  const usingArch  = archBase !== null;
  const tier       = getGradeTier(score);
  const hidden     = isHiddenDev(player.devTrait);
  const devBonus   = hidden ? estimateHiddenDev(player) : getDevBonus(player.devTrait);
  const ceilBonus  = physOutlierBonus(player);
  const starBonus  = STAR_BONUS[String(player.stars)] ?? 0;
  const combine  = generateCombine(player);
  const { gpa, major } = generateAcademic(player);
  const quote    = generateQuote(player);
  const { rank, total } = getPoolRank(player, allPlayers, weightsMap);
  const poolAvg  = getPoolAvg(player.position, allPlayers);
  const analysis = buildAnalysisText(player, score, baseAvg, rank, total);

  const priority = PRIORITY_ATTRS[player.position] ?? [];
  const attrEntries = Object.entries(player.attributes).sort((a, b) => b[1] - a[1]);
  const priorityEntries = attrEntries.filter(([k]) => priority.includes(k));
  const useList  = priorityEntries.length >= 2 ? priorityEntries : attrEntries;
  const strengths  = useList.slice(0, 3);
  const weaknesses = [...useList].reverse().slice(0, 2);

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
        {/* Header */}
        <div className="p-5 border-b border-surface-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
              {player.position} · {player.archetype}
            </p>
            <h2 className="text-xl font-black text-white">{player.name}</h2>
            <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1.5">
              {player.stars}★
              {/* Same badge styling (color + border + glow) as the dev trait
                  pill in the Recruiting Database table, not just plain
                  colored text — a bare span can't reproduce the pill's glow
                  since that's a box-shadow on an actual box. */}
              {hidden
                ? <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-950 border border-slate-700 text-slate-600 italic">HIDDEN</span>
                : <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    player.devTrait === 'Elite'  ? 'bg-surface-3 border border-[#0E7A2A] text-[#22E065] shadow-[0_0_16px_rgba(14,122,42,0.85)]' :
                    player.devTrait === 'Star'   ? 'bg-surface-3 border border-[#9C7209] text-[#FFD100] shadow-[0_0_14px_rgba(156,114,9,0.8)]' :
                    player.devTrait === 'Impact' ? 'bg-surface-3 border border-[#7C8991] text-[#D6DEE2]' :
                                                    'bg-surface-3 border border-[#8C5524] text-[#CD7F32]'
                  }`}>{player.devTrait.toUpperCase()}</span>
              }
            </p>
          </div>
          <div className={`flex flex-col items-center px-4 py-2 rounded-xl border-2 flex-shrink-0 ${tier.badgeCls}`}>
            <span className="text-3xl font-black tracking-tight">{tier.grade}</span>
            <span className="text-[8px] uppercase tracking-widest font-bold opacity-70 mt-0.5">Grade</span>
          </div>
        </div>

        <div className="p-5 space-y-5">

          {/* Analysis summary */}
          <p className="text-xs text-txt-secondary leading-relaxed">{analysis}</p>

          {/* Score breakdown */}
          <section>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Score Breakdown</h3>
            <div className="bg-surface-3 border border-surface-4 rounded-lg overflow-hidden divide-y divide-surface-4 text-xs">
              <div className="flex justify-between px-3 py-2">
                <span className="text-slate-400">{usingArch ? 'Archetype Base Score' : 'Weighted Attribute Avg'}</span>
                <span className="font-bold text-white">{displayBase.toFixed(1)}</span>
              </div>
              {usingArch && (
                <div className="flex justify-between px-3 py-2 opacity-50">
                  <span className="text-slate-500 text-[11px] italic">Attr avg (all entered)</span>
                  <span className="text-slate-500 text-[11px]">{baseAvg.toFixed(1)}</span>
                </div>
              )}
              {hidden ? (
                <div className="flex justify-between px-3 py-2">
                  <span className="text-txt-tertiary italic text-[11px]">Estimated Dev (pending reveal)</span>
                  <span className="font-bold text-txt-secondary">+{devBonus.toFixed(1)}</span>
                </div>
              ) : (
                <div className="flex justify-between px-3 py-2">
                  <span className="text-slate-400">{player.devTrait} Dev Adjustment</span>
                  <span className={'font-bold text-txt-secondary'}>
                    {devBonus > 0 ? '+' : ''}{devBonus}
                  </span>
                </div>
              )}
              {ceilBonus > 0 && (
                <div className="flex justify-between px-3 py-2">
                  <span className="text-slate-400">Physical Ceiling Bonus</span>
                  <span className="font-bold text-txt-secondary">+{ceilBonus.toFixed(1)}</span>
                </div>
              )}
              {starBonus !== 0 && (
                <div className="flex justify-between px-3 py-2">
                  <span className="text-slate-400">{player.stars}-Star Rating Bonus</span>
                  <span className={'font-bold text-txt-secondary'}>
                    {starBonus > 0 ? '+' : ''}{starBonus}
                  </span>
                </div>
              )}
              <div className="flex justify-between px-3 py-2 bg-surface-4">
                <span className="text-slate-300 font-bold">Composite Score</span>
                <span className="font-black text-white">{score.toFixed(1)}</span>
              </div>
            </div>
            {poolAvg && (
              <p className="text-[10px] text-slate-500 mt-2">
                Ranks <span className="text-white font-bold">#{rank}</span> of{' '}
                <span className="text-white font-bold">{total}</span> {player.position} prospects in database
                {' '}· Pool weighted avg: <span className="text-white font-bold">{poolAvg}</span>
              </p>
            )}
          </section>

          {/* Strengths / Needs Work */}
          <section className="grid grid-cols-2 gap-3">
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-txt-tertiary mb-2">Strengths</h3>
              <div className="space-y-1.5">
                {strengths.map(([k, v]) => (
                  <div key={k} className="flex justify-between items-center bg-surface-3 border border-surface-4 rounded px-2.5 py-1.5">
                    <span className="text-[10px] text-txt-secondary font-medium">{k}</span>
                    <span className="text-[10px] font-black text-txt-secondary">{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-txt-tertiary mb-2">Needs Work</h3>
              <div className="space-y-1.5">
                {weaknesses.map(([k, v]) => (
                  <div key={k} className="flex justify-between items-center bg-surface-3 border border-surface-4 rounded px-2.5 py-1.5">
                    <span className="text-[10px] text-txt-secondary font-medium">{k}</span>
                    <span className="text-[10px] font-black text-txt-secondary">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Combine projections */}
          <section>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Combine Projections</h3>
            <div className="grid grid-cols-5 gap-2">
              {[
                { label: '40 Dash',  value: `${combine.forty}s` },
                { label: 'Bench',    value: `${combine.bench} reps` },
                { label: 'Vertical', value: `${combine.vert}"` },
                { label: '3-Cone',   value: `${combine.cone}s` },
                { label: 'Broad',    value: `${combine.broad}"` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-surface-3 border border-surface-4 rounded-lg p-2.5 text-center">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">{label}</p>
                  <p className="text-xs font-black text-white">{value}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Academic profile */}
          <section className="flex items-center justify-between bg-surface-3 border border-surface-4 rounded-lg px-4 py-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Academic Profile</p>
              <p className="text-sm font-bold text-white mt-0.5">{major}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">GPA</p>
              <p className="text-xl font-black text-txt-secondary">{gpa}</p>
            </div>
          </section>

          {/* Scout interview */}
          <section className="bg-surface-3 border border-surface-4 rounded-lg p-4 space-y-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Scout: "Describe your game for me."</p>
            <p className="text-xs text-slate-200 leading-relaxed italic">"{quote}"</p>
            <p className="text-[9px] text-slate-500 mt-1">— {player.name}</p>
          </section>

        </div>

        <div className="px-5 pb-5">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg text-xs font-bold text-slate-300 transition"
          >
            Close Report
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Modal ───────────────────────────────────────────────────────────────
const POSITIONS_LIST = ['QB','HB','FB','WR','TE','OT','OG','C','DE','DT','OLB','MIKE','CB','FS','SS','ATH','K','P'];
const DEV_TRAITS = ['Hidden', 'Normal', 'Impact', 'Star', 'Elite'];

function EditModal({ player, pool, weightsMap, onSave, onClose }) {
  const [form, setForm] = useState({
    name: player.name,
    position: player.position,
    archetype: player.archetype,
    devTrait: player.devTrait || 'Hidden',
    gemBust: player.gemBust || '',
    stars: player.stars,
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

  // Nearest-centroid suggestion from revealed HS recruits at this archetype+star
  // — only meaningful while the real dev trait isn't locked in yet.
  const prediction = useMemo(() => {
    if (form.devTrait !== 'Hidden' || !form.position || !form.archetype) return null;
    const numericAttrs = Object.fromEntries(Object.entries(visibleAttrs).map(([k, v]) => [k, parseInt(v, 10) || 0]));
    return predictDevTrait(pool, form.position, form.archetype, String(form.stars), numericAttrs, weightsMap);
  }, [pool, weightsMap, form.devTrait, form.position, form.archetype, form.stars, visibleAttrs]);

  // Live grade/score preview — recomputed from the in-progress form state so
  // editing attributes or dev trait visibly moves the grade before saving,
  // instead of only updating once the modal closes and the table re-renders.
  const liveScore = useMemo(() => {
    const numericAttrs = Object.fromEntries(Object.entries(visibleAttrs).map(([k, v]) => [k, parseInt(v, 10) || 0]));
    return computeScore({ position: form.position, archetype: form.archetype, devTrait: form.devTrait, stars: form.stars, attributes: numericAttrs }, weightsMap);
  }, [weightsMap, form.position, form.archetype, form.devTrait, form.stars, visibleAttrs]);
  const liveTier = useMemo(() => getGradeTier(liveScore), [liveScore]);

  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    const updated = {
      ...player,
      name:      form.name.trim(),
      position:  form.position,
      archetype: form.archetype.trim(),
      devTrait:  form.devTrait,
      gemBust:   form.gemBust,
      stars:     form.stars,
      group:     form.position === 'ATH' ? 'Athlete Pipeline' : ['QB','HB','WR','TE','OT','OG','C'].includes(form.position) ? 'Offense' : 'Defense',
      attributes: Object.fromEntries(Object.entries(visibleAttrs).map(([k, v]) => [k, parseInt(v, 10) || 0])),
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
              <span className="text-[9px] tabular-nums text-slate-500">{liveScore.toFixed(1)}</span>
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
                  {POSITIONS_LIST.map(pos => <option key={pos} value={pos}>{pos}</option>)}
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
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Dev Trait</label>
                <select
                  value={form.devTrait}
                  onChange={e => setField('devTrait', e.target.value)}
                  className="w-full bg-surface-3 border border-surface-4 text-xs p-2.5 rounded-lg text-white focus:outline-none focus:border-surface-5 transition"
                >
                  {DEV_TRAITS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                {prediction && (
                  <p className="text-[9px] text-txt-secondary mt-1">
                    Predicted: {prediction.closest} (closest match · {prediction.availableGroups} group{prediction.availableGroups !== 1 ? 's' : ''} of data, n={prediction.n})
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

        <div className="px-5 pb-5 flex gap-3">
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
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PlayerDatabase({ players, roleContext, teamColors, teamLogo, onDelete, onEdit, onGoToInput, onGoToThresholds, onBack, dynastyId = null, highlightPid = null }) {
  const { getStaffData } = createStaffAccessor(dynastyId);
  const p = teamColors?.primary || '#374151';
  const [filterPos, setFilterPos] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const rowRefs = useRef({});
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [editingDevFor, setEditingDevFor] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'recency', dir: 'desc' });
  const [scoutImg, setScoutImg] = useState('');
  const [scoutName, setScoutName] = useState('National Scout');

  // ── Google Sheets sync for the Recruiting Database ── This is deliberately
  // independent of the Targets tab: recruits that come in through Save/Import
  // live in dynasty.recruitingDatabasePlayers, never dynasty.players/isTarget,
  // so they can never surface on the Targets page. "Save" pushes whatever the
  // Recruiting Database currently shows out to a persistent per-dynasty sheet
  // (creating it on first use); "Import" pulls another sheet's recruits in
  // (most-recent-edit-wins per recruit) — e.g. to seed a brand-new dynasty
  // from an old one's database without starting scouting over from zero.
  const { currentDynasty, updateDynasty, dynasties } = useDynasty();
  const auth = useAuthErrorHandler();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [importSheetInput, setImportSheetInput] = useState('');
  const [showHelpPanel, setShowHelpPanel] = useState(false);
  const [resetting, setResetting] = useState(false);

  const recruitingDatabasePlayers = currentDynasty?.recruitingDatabasePlayers || [];

  // Everything the Recruiting Database currently shows — real targets/sibling
  // scouted players (the `players` prop) plus anything pulled in via Import.
  // Save pushes this full combined view, since the point is mirroring what's
  // on screen; Import stays scoped to recruitingDatabasePlayers only (below)
  // so a pulled-in recruit can never retroactively become an isTarget record.
  //
  // recruitingDatabaseExcludedPids is a sheet-driven deletion of a recruit
  // that isn't stored in recruitingDatabasePlayers at all (a sibling's
  // scouted player, sourced fresh from `players` every render) — this is the
  // only place that deletion can actually be enforced. A real Target's pid
  // never ends up in this list (handleSave never lets Save delete one).
  const excludedPids = currentDynasty?.recruitingDatabaseExcludedPids || [];
  const combinedPlayers = useMemo(() => {
    const excluded = new Set(excludedPids.map(String));
    const basePlayers = excluded.size ? players.filter(p => !excluded.has(String(p.pid))) : players;
    if (!recruitingDatabasePlayers.length) return basePlayers;
    const seen = new Set(basePlayers.map(p => `${p.pid}`));
    const extra = recruitingDatabasePlayers.filter(p => !seen.has(`${p.pid}`) && !excluded.has(String(p.pid)));
    return [...basePlayers, ...extra];
  }, [players, recruitingDatabasePlayers, excludedPids]);

  // The actual sync engine — shared by the manual "Save" button and the
  // automatic push effect below. If a sheet is already linked, we read its
  // current contents FIRST and reconcile per recruit before writing anything
  // back — otherwise a manual edit made directly in the sheet would just get
  // silently clobbered by whatever the app already had. This can't be judged
  // by comparing timestamps (a human editing a cell in Sheets never bumps any
  // per-row "last edited" marker — only the app's own writes do), so
  // reconcileRecruitingDatabaseSync instead diffs each pid's current content
  // against a snapshot of what was last confirmed synced
  // (dynasty.recruitingDatabaseSyncedSnapshot): if only the sheet changed
  // since then, the sheet wins; otherwise local wins, so a deliberate in-app
  // edit is never silently overwritten. A recruit whose pid matches a real
  // target is routed through the same save path the Edit modal uses, so a
  // sheet edit to an existing target updates that record instead of forking a
  // duplicate; anything else lands in recruitingDatabasePlayers. A recruit
  // missing from the sheet that was synced before was deleted there on
  // purpose and is dropped locally too — unless it's a real target, which
  // this sync can never delete.
  //
  // Running the SAME full reconcile automatically (below) as well as on
  // manual Save is deliberate: a naive one-way "push local on every change"
  // auto-sync would silently clobber a pending manual sheet edit the moment
  // any unrelated local change fired it. Reconciling both directions every
  // time means there's no unsafe window — auto-push keeps the sheet current
  // as soon as something changes here, and manual Save exists for the case
  // nothing local changed but the sheet itself was hand-edited (auto-push
  // never fires from a sheet-only edit).
  // Auto-push and manual Save both call syncNow, and can genuinely overlap
  // (a click landing mid-debounce). Two full syncs running concurrently
  // against the same Sheet would race — both reading the same starting
  // state, both writing back, one clobbering the other's result. syncNow is
  // the public entry point; it serializes every call through a queue so
  // syncs always run one at a time, never dropped, never overlapping.
  const syncQueueRef = useRef(Promise.resolve());
  const syncNow = (opts) => {
    const run = () => syncNowInner(opts);
    const next = syncQueueRef.current.then(run, run);
    syncQueueRef.current = next.catch(() => {});
    return next;
  };

  const syncNowInner = async ({ silent = false } = {}) => {
    if (!currentDynasty) return;
    if (!silent) setSaving(true);
    try {
      // Treat a linked sheet from before this feature's current format (e.g.
      // an early trial sheet with no dedicated "Recruiting Database" tab) the
      // same as no sheet at all — the stale link gets silently replaced with
      // a fresh, correctly-formatted one below instead of failing every save.
      let sheetId = currentDynasty.recruitingDatabaseSheetId;
      if (sheetId) {
        const valid = (await sheetExists(sheetId)) && (await sheetHasRecruitingDatabaseTab(sheetId));
        if (!valid) sheetId = null;
      }

      let finalRecruits = combinedPlayers;

      if (!sheetId) {
        const sheetInfo = await createRecruitingDatabaseSheet('CFB 27 - Recruiting Database', combinedPlayers, currentDynasty.teams);
        sheetId = sheetInfo.spreadsheetId;
        const seedSnapshot = {};
        combinedPlayers.forEach(p => { if (p.pid != null) seedSnapshot[String(p.pid)] = snapshotKey(p); });
        await updateDynasty(currentDynasty.id, {
          recruitingDatabaseSheetId: sheetId,
          recruitingDatabaseSyncedSnapshot: seedSnapshot,
          recruitingDatabaseLastSyncedAt: Date.now(),
        });
      } else {
        const sheetRows = await readRecruitingDatabaseSheet(sheetId);
        // Deletion protection must be scoped to THIS dynasty's own real
        // Targets only (currentDynasty.players) — not the broader `players`
        // prop, which also includes sibling-dynasty scouted players shown
        // here for reference. A sibling's recruit isn't this dynasty's board;
        // it shouldn't be immune from a sheet-driven cleanup.
        const targetPidSet = new Set((currentDynasty.players || []).filter(p => p.pid != null).map(p => String(p.pid)));

        const { mergedRecruits, nextSnapshot, deletedPids } = reconcileRecruitingDatabaseSync({
          sheetRows,
          localRecruits: combinedPlayers,
          targetPids: targetPidSet,
          syncedSnapshot: currentDynasty.recruitingDatabaseSyncedSnapshot || {},
          lastSyncedAt: currentDynasty.recruitingDatabaseLastSyncedAt || 0,
        });
        finalRecruits = mergedRecruits;

        const localByPid = new Map(players.filter(p => p.pid != null).map(p => [String(p.pid), p]));
        const recruitingDatabaseUpdates = [];

        for (const merged of mergedRecruits) {
          const key = merged.pid != null ? String(merged.pid) : null;
          const localOriginal = key ? localByPid.get(key) : null;
          if (localOriginal) {
            if (localOriginal !== merged) {
              await onEdit?.({ ...localOriginal, ...merged, sourceDynastyId: localOriginal.sourceDynastyId }, localOriginal);
            }
          } else {
            recruitingDatabaseUpdates.push(merged);
          }
        }

        // A deleted pid sourced from `players` (a sibling's scouted player,
        // never stored in recruitingDatabasePlayers) would otherwise keep
        // reappearing — that pool is recomputed fresh from its live source
        // every render, independent of anything written here. Persist an
        // explicit exclusion list so the deletion actually sticks.
        const nextExcludedPids = Array.from(new Set([
          ...(currentDynasty.recruitingDatabaseExcludedPids || []),
          ...deletedPids,
        ]));

        await updateDynasty(currentDynasty.id, {
          recruitingDatabasePlayers: recruitingDatabaseUpdates,
          recruitingDatabaseSyncedSnapshot: nextSnapshot,
          recruitingDatabaseLastSyncedAt: Date.now(),
          recruitingDatabaseExcludedPids: nextExcludedPids,
        });
        await writeRecruitingDatabaseRows(sheetId, mergedRecruits);
      }

      // Skip the read-back confirmation on a silent auto-push — it's an
      // extra API call on every background sync, and a failure there isn't
      // actionable without a UI to show it; the next auto-push (or a manual
      // Save) just retries.
      if (!silent) {
        const confirmRows = await readRecruitingDatabaseSheet(sheetId);
        const expectedNames = finalRecruits.map(p => p.name).filter(Boolean).sort();
        const actualNames = confirmRows.map(r => r.name).filter(Boolean).sort();
        const confirmed = expectedNames.length === actualNames.length
          && expectedNames.every((name, i) => name === actualNames[i]);
        if (!confirmed) throw new Error('Sheet contents did not match after saving.');
        toast.success('Synced with Google Sheets');
      }
    } catch (error) {
      if (silent) {
        console.warn('Recruiting Database auto-sync failed:', error?.message || error);
        return;
      }
      if (!auth.handleError(error)) {
        console.error('Recruiting Database save error:', error);
        toast.error('Error Saving : Please Try Again');
      }
    } finally {
      if (!silent) setSaving(false);
    }
  };

  const handleSave = () => syncNow({ silent: false });

  const extractSheetId = (input) => {
    const s = (input || '').trim();
    const m = s.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return m ? m[1] : s;
  };

  const handleOpenSheet = () => {
    const sheetId = currentDynasty?.recruitingDatabaseSheetId;
    if (!sheetId) {
      toast.error('No Google Sheet linked yet — Save or Import one first.');
      return;
    }
    window.open(`https://docs.google.com/spreadsheets/d/${sheetId}/edit`, '_blank', 'noopener,noreferrer');
  };

  // Wipes this dynasty's own Recruiting Database data and unlinks the
  // current Google Sheet — the next Save/auto-create starts a brand new one.
  // Real Targets (currentDynasty.players/isTarget) are never touched, same
  // protection Save's deletion-sync already gives them — but everything ELSE
  // currently shown (recruitingDatabasePlayers entries and sibling-dynasty
  // scouted players, neither of which live in recruitingDatabasePlayers)
  // needs to be explicitly excluded, not just have that store cleared —
  // otherwise the table looks completely unchanged after "wiping it clean."
  const handleReset = async () => {
    if (!currentDynasty) return;
    const confirmed = await confirm({
      title: 'Reset the Recruiting Database?',
      message: "This empties the Recruiting Database — everything imported plus any sibling-dynasty recruits shown here for reference — and unlinks the current Google Sheet so you can start fresh. Your real Targets aren't affected. The old Google Sheet itself isn't deleted, just disconnected. This cannot be undone.",
      confirmLabel: 'Reset',
      variant: 'danger',
    });
    if (!confirmed) return;
    setResetting(true);
    try {
      const targetPidSet = new Set((currentDynasty.players || []).filter(p => p.pid != null).map(p => String(p.pid)));
      const nonTargetPids = combinedPlayers
        .filter(p => p.pid != null && !targetPidSet.has(String(p.pid)))
        .map(p => String(p.pid));

      await updateDynasty(currentDynasty.id, {
        recruitingDatabasePlayers: [],
        recruitingDatabaseSheetId: null,
        recruitingDatabaseSyncedSnapshot: {},
        recruitingDatabaseLastSyncedAt: null,
        recruitingDatabaseExcludedPids: nonTargetPids,
      });
      toast.success('Recruiting Database reset.');
      setShowHelpPanel(false);
    } catch (error) {
      console.error('Recruiting Database reset error:', error);
      toast.error('Failed to reset. Please try again.');
    } finally {
      setResetting(false);
    }
  };

  // Auto-push: the moment the Recruiting Database's content actually changes
  // (a recruit added, edited, imported, deleted), sync it out to the linked
  // Sheet automatically — no manual Save click needed to keep the Sheet
  // current. Debounced so a burst of edits collapses into one sync instead of
  // one per keystroke. This runs syncNow's full reconcile, not a one-way
  // push, so it can never clobber a pending manual sheet edit (see syncNow's
  // comment). Also creates the sheet automatically on the very first recruit.
  const lastAutoSyncedSignatureRef = useRef(null);
  const autoSyncTimerRef = useRef(null);
  useEffect(() => {
    if (!currentDynasty || !combinedPlayers.length) return;
    const signature = combinedPlayers.map(p => `${p.pid}:${p.updatedAt || 0}`).sort().join('|');
    if (signature === lastAutoSyncedSignatureRef.current) return;

    if (autoSyncTimerRef.current) clearTimeout(autoSyncTimerRef.current);
    autoSyncTimerRef.current = setTimeout(() => {
      lastAutoSyncedSignatureRef.current = signature;
      syncNow({ silent: true });
    }, 2000);

    return () => { if (autoSyncTimerRef.current) clearTimeout(autoSyncTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combinedPlayers, currentDynasty?.id]);

  const importCandidates = (dynasties || []).filter(
    d => d.id !== currentDynasty?.id && d.recruitingDatabaseSheetId
  );

  const runImport = async (sheetId) => {
    if (!currentDynasty || !sheetId) return;
    setImporting(true);
    try {
      const sheetRows = await readRecruitingDatabaseSheet(sheetId);
      const { mergedRecruits } = mergeRecruitingDatabaseRows({
        sheetRows,
        localRecruits: recruitingDatabasePlayers,
      });
      await updateDynasty(currentDynasty.id, {
        recruitingDatabasePlayers: mergedRecruits,
        ...(currentDynasty.recruitingDatabaseSheetId ? {} : { recruitingDatabaseSheetId: sheetId }),
      });
      toast.success(`Imported — ${mergedRecruits.length} recruit${mergedRecruits.length !== 1 ? 's' : ''} in the database.`);
      setShowImportPanel(false);
      setImportSheetInput('');
    } catch (error) {
      if (!auth.handleError(error)) {
        console.error('Recruiting Database import error:', error);
        toast.error('Error Importing : Please Try Again');
      }
    } finally {
      setImporting(false);
    }
  };

  // Edits/deletes on a sheet-sourced recruit must stay inside
  // recruitingDatabasePlayers — never fall through to onEdit/onDelete, which
  // operate on dynasty.players/isTarget and would be the exact leak this
  // feature is designed to avoid.
  const isFromRecruitingDatabase = (pl) =>
    pl?.pid != null && recruitingDatabasePlayers.some(p => String(p.pid) === String(pl.pid));

  // Must be async and must return/await the underlying write — EditModal's
  // own handleSave does `const ok = await onSave(updated); if (ok !== false)
  // onClose()`. A version that fires the write and returns undefined
  // synchronously (the previous bug here) makes the modal think every save
  // succeeded and close immediately, whether or not anything actually
  // persisted or a write error was silently swallowed.
  const handleEditSave = async (updated, original) => {
    if (isFromRecruitingDatabase(original)) {
      try {
        const next = recruitingDatabasePlayers.map(p => String(p.pid) === String(original.pid) ? { ...updated, updatedAt: Date.now() } : p);
        await updateDynasty(currentDynasty.id, { recruitingDatabasePlayers: next });
        return true;
      } catch (error) {
        console.error('Recruiting Database edit save error:', error);
        toast.error('Failed to save your edit. Please try again.');
        return false;
      }
    }
    if (!onEdit) return false;
    return await onEdit(updated, original);
  };

  const handleDelete = async (pl) => {
    if (isFromRecruitingDatabase(pl)) {
      try {
        const next = recruitingDatabasePlayers.filter(p => String(p.pid) !== String(pl.pid));
        await updateDynasty(currentDynasty.id, { recruitingDatabasePlayers: next });
      } catch (error) {
        console.error('Recruiting Database delete error:', error);
        toast.error('Failed to delete. Please try again.');
      }
      return;
    }
    onDelete && onDelete(pl);
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
  const weightsMap = useMemo(() => buildWeightsMap(pool, combinedPlayers), [pool, combinedPlayers]);

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
      case 'score':     av = computeScore(a, weightsMap);                  bv = computeScore(b, weightsMap);                  break;
      case 'group':     av = a.group;                                      bv = b.group;                                      break;
      case 'position':  av = a.position;                                   bv = b.position;                                   break;
      case 'archetype': av = a.archetype;                                  bv = b.archetype;                                  break;
      case 'stars':     av = parseInt(a.stars);                            bv = parseInt(b.stars);                            break;
      case 'dev':       av = DEV_ORDER[a.devTrait] ?? 1;                   bv = DEV_ORDER[b.devTrait] ?? 1;                   break;
      case 'gpa':       av = parseFloat(generateAcademic(a).gpa);          bv = parseFloat(generateAcademic(b).gpa);          break;
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
      {selectedPlayer && (
        <GradeModal player={selectedPlayer} allPlayers={combinedPlayers} weightsMap={weightsMap} onClose={() => setSelectedPlayer(null)} />
      )}
      {editingPlayer && (
        <EditModal player={editingPlayer} pool={pool} weightsMap={weightsMap} onSave={updated => handleEditSave(updated, editingPlayer)} onClose={() => setEditingPlayer(null)} />
      )}
      <AuthErrorModal isOpen={auth.showAuthError} onClose={auth.closeAuthError} onRefresh={auth.retry} />

      {/* Header strip */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-surface-2 border border-surface-4">
        <h2 className="text-sm font-display font-bold uppercase text-txt-primary">Recruiting Database</h2>
        <div className="flex items-center gap-3 flex-shrink-0">
          {currentDynasty && (
            <div className="relative">
              <button
                onClick={() => setShowImportPanel(v => !v)}
                title="Pick a Google Sheet to import as this dynasty's Recruiting Database"
                className="flex items-center gap-1.5 text-xs font-display font-bold uppercase text-txt-secondary hover:text-txt-primary transition px-3 py-1.5 rounded-lg border border-surface-4 hover:bg-surface-3"
              >
                Import
              </button>
              {showImportPanel && (
                <div
                  className="absolute right-0 top-full mt-2 w-72 p-3 rounded-xl bg-surface-2 border border-surface-4 shadow-2xl z-50 space-y-3"
                  onClick={e => e.stopPropagation()}
                >
                  <p className="text-xs font-display font-bold uppercase text-txt-primary">Select a Sheet to Import</p>
                  {currentDynasty?.recruitingDatabaseSheetId && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-txt-tertiary">This dynasty's linked sheet</p>
                      <button
                        onClick={() => runImport(currentDynasty.recruitingDatabaseSheetId)}
                        disabled={importing}
                        className="w-full text-left text-xs text-txt-secondary hover:text-txt-primary transition px-2 py-1.5 rounded-lg border border-surface-4 hover:bg-surface-3 disabled:opacity-50"
                      >
                        Re-sync latest edits from linked sheet
                      </button>
                    </div>
                  )}
                  {importCandidates.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-txt-tertiary">From another dynasty</p>
                      {importCandidates.map(d => (
                        <button
                          key={d.id}
                          onClick={() => runImport(d.recruitingDatabaseSheetId)}
                          disabled={importing}
                          className="w-full text-left text-xs text-txt-secondary hover:text-txt-primary transition px-2 py-1.5 rounded-lg border border-surface-4 hover:bg-surface-3 disabled:opacity-50"
                        >
                          {d.teamName || d.coachName || 'Dynasty'}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wider text-txt-tertiary">Or paste a Sheet link/ID</p>
                    <input
                      type="text"
                      value={importSheetInput}
                      onChange={e => setImportSheetInput(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      className="w-full text-xs bg-surface-3 border border-surface-4 rounded-lg px-2 py-1.5 text-txt-primary placeholder:text-txt-tertiary focus:outline-none"
                    />
                    <button
                      onClick={() => runImport(extractSheetId(importSheetInput))}
                      disabled={importing || !importSheetInput.trim()}
                      className="w-full text-xs font-display font-bold uppercase text-txt-secondary hover:text-txt-primary transition px-3 py-1.5 rounded-lg border border-surface-4 hover:bg-surface-3 disabled:opacity-50"
                    >
                      {importing ? 'Importing…' : 'Import'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {currentDynasty && (
            <button
              onClick={handleOpenSheet}
              title="Open the Google Sheet linked to this Recruiting Database"
              className="flex items-center gap-1.5 text-xs font-display font-bold uppercase text-txt-secondary hover:text-txt-primary transition px-3 py-1.5 rounded-lg border border-surface-4 hover:bg-surface-3"
            >
              Open
            </button>
          )}
          {currentDynasty && (
            <button
              onClick={handleSave}
              disabled={saving}
              title="Pull in any edits made directly in the linked Google Sheet (local changes already auto-sync out as you make them)"
              className="flex items-center gap-1.5 text-xs font-display font-bold uppercase text-txt-secondary hover:text-txt-primary transition px-3 py-1.5 rounded-lg border border-surface-4 hover:bg-surface-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
          {currentDynasty && (
            <div className="relative">
              <button
                onClick={() => setShowHelpPanel(v => !v)}
                title="What the Recruiting Database is and how its buttons work"
                className="flex items-center gap-1.5 text-xs font-display font-bold uppercase text-txt-secondary hover:text-txt-primary transition px-3 py-1.5 rounded-lg border border-surface-4 hover:bg-surface-3"
              >
                Help
              </button>
              {showHelpPanel && (
                <div
                  className="absolute right-0 top-full mt-2 w-96 p-4 rounded-xl bg-surface-2 border border-surface-4 shadow-2xl z-50 space-y-4"
                  onClick={e => e.stopPropagation()}
                >
                  <p className="text-xs font-display font-bold uppercase text-txt-primary">Help</p>

                  <div className="space-y-2 text-xs text-txt-secondary leading-relaxed">
                    <p>
                      The Recruiting Database is a personal scouting reference for every recruit
                      you've targeted — plus recruits scouted in your other dynasties on this
                      account, and anything you bring in via Import. It's separate from the Targets
                      page: editing or removing something here never changes your real Targets board,
                      except when you deliberately edit one of your own targets through here.
                    </p>
                    <p>
                      It mirrors itself into a Google Sheet automatically — any change you make here
                      (a recruit added, edited, imported, or removed) syncs out to the Sheet on its
                      own within a couple seconds, so you can browse or bulk-edit it outside the app,
                      or let a brand-new dynasty pick up an old one's database instead of starting
                      from zero.
                    </p>
                    <p>
                      <strong className="text-txt-primary">Import</strong> pulls recruits in from a
                      Google Sheet — either one already linked to another of your dynasties, or any
                      Sheet link/ID you paste in. Imported recruits are added for reference only; they
                      never become real Targets.
                    </p>
                    <p>
                      <strong className="text-txt-primary">Open</strong> opens the Google Sheet
                      currently linked to this dynasty's Recruiting Database in a new tab.
                    </p>
                    <p>
                      <strong className="text-txt-primary">Save</strong> pulls in edits made directly
                      in the Sheet — local changes already sync out on their own, so Save exists for
                      the case where nothing changed here but you hand-edited the Sheet itself. A
                      recruit deleted from the Sheet is removed here too, except a real Target, which
                      this can never delete.
                    </p>
                  </div>

                  <div className="pt-3 border-t border-surface-4 space-y-2">
                    <button
                      onClick={handleReset}
                      disabled={resetting}
                      className="w-full text-xs font-display font-bold uppercase text-txt-secondary hover:text-txt-primary transition px-3 py-1.5 rounded-lg border border-surface-4 hover:bg-surface-3 disabled:opacity-50"
                    >
                      {resetting ? 'Resetting…' : 'Reset'}
                    </button>
                    <p className="text-[10px] text-txt-tertiary leading-relaxed">
                      Having issues? Press the reset button to wipe the Recruiting Database clean.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
          {onGoToInput && (
            <button onClick={onGoToInput} className="text-xs text-txt-secondary hover:text-txt-primary transition px-3 py-1.5 rounded-lg border border-surface-4 hover:bg-surface-3">
              + New Report
            </button>
          )}
          {onBack && (
            <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-display font-bold uppercase text-txt-secondary hover:text-txt-primary transition px-3 py-1.5 rounded-lg border border-surface-4 hover:bg-surface-3">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><polyline points="15 18 9 12 15 6"/></svg>
              Main Hub
            </button>
          )}
          {onGoToThresholds && (
            <button onClick={onGoToThresholds} className="flex items-center gap-1.5 text-xs font-display font-bold uppercase text-txt-secondary hover:text-txt-primary transition px-3 py-1.5 rounded-lg border border-surface-4 hover:bg-surface-3">
              Threshold Lookup
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* Analyst identity + filters row */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch">

        {/* Scout portrait card */}
        <div className="relative rounded-xl overflow-hidden shadow-xl w-full h-32 sm:w-[110px] sm:h-[100px] sm:flex-shrink-0">
          {scoutImg ? (
            <img src={scoutImg} alt="National Scout" className="absolute inset-0 w-full h-full object-cover object-top" />
          ) : (
            <div className="absolute inset-0 bg-surface-3" />
          )}
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 82%, rgba(0,0,0,0.85) 90%, rgba(0,0,0,0.95) 100%)' }} />
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, transparent 85%, #38bdf855 100%)' }} />
          <p className="absolute top-2 right-2 text-[5px] font-black uppercase tracking-[0.12em] text-sky-400" style={{ textShadow: '0 1px 6px rgba(0,0,0,1)' }}>National Scout</p>
          <div className="absolute bottom-0 left-0 right-0 p-2">
            <div className="w-4 h-0.5 mb-1 rounded-full bg-sky-400" />
            {(() => {
              const parts = scoutName.trim().split(' ');
              const last = parts.pop() || '';
              const first = parts.join(' ');
              return (
                <>
                  {first && <p className="leading-none text-[6px] font-semibold uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.7)', textShadow: '0 1px 6px rgba(0,0,0,1)' }}>{first}</p>}
                  <p className="text-white leading-none font-bold text-xs" style={{ textShadow: '0 2px 10px rgba(0,0,0,1)' }}>{last}</p>
                </>
              );
            })()}
          </div>
        </div>

        {/* Right column: quip card + filters */}
        <div className="flex-1 space-y-3 min-w-0">

          {/* Search + position filters */}
          <div className="rounded-xl p-3.5 space-y-2.5 bg-surface-2 border border-surface-4 sm:h-[100px]">
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
                  {pos}
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden bg-surface-2 border border-surface-4">
        <div className="overflow-hidden">
          <table className="w-full table-fixed text-left border-collapse">
            <colgroup>
              <col style={{ width: '9%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '4%' }} />
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
                  const score = computeScore(pl, weightsMap);
                  const tier  = getGradeTier(score);
                  const { gpa } = generateAcademic(pl);
                  const hiddenDev = isHiddenDev(pl.devTrait);
                  const formOrder = getFormAttrs(pl.position, pl.archetype);
                  const orderedAttrs = formOrder.length
                    ? [
                        ...formOrder.filter(k => pl.attributes[k] != null).map(k => [k, pl.attributes[k]]),
                        ...Object.entries(pl.attributes).filter(([k, v]) => !formOrder.includes(k) && v != null),
                      ]
                    : Object.entries(pl.attributes).filter(([, v]) => v != null);
                  return (
                    <tr
                      key={i}
                      ref={el => { if (el) rowRefs.current[pl.pid] = el; }}
                      onClick={() => setSelectedPlayer(pl)}
                      className={`transition group cursor-pointer border-b border-surface-4 hover:bg-surface-3 ${String(pl.pid) === String(highlightPid) ? 'bg-surface-3' : ''}`}
                    >
                      <td className="px-2 py-3.5 text-center text-[10px] tabular-nums text-txt-tertiary overflow-hidden">{pl.recentRank ?? (pl.addedIndex != null ? pl.addedIndex + 1 : '—')}</td>
                      <td className="px-2 py-3.5 font-semibold text-txt-secondary group-hover:text-txt-primary transition overflow-hidden">
                        <ProspectName name={pl.name} gemBust={pl.gemBust} />
                      </td>
                      <td className="px-2 py-3.5 text-center overflow-hidden">
                        <div className="inline-flex flex-col items-center gap-0.5">
                          <span className={`font-black tracking-wide text-xs px-2 py-0.5 rounded border ${tier.badgeCls}`}>{tier.grade}</span>
                          <span className="text-[9px] tabular-nums text-slate-600">{score.toFixed(1)}</span>
                        </div>
                      </td>
                      <td className="px-2 py-3.5 uppercase font-semibold text-txt-tertiary text-[10px] tracking-wider overflow-hidden truncate">{pl.group}</td>
                      <td className="px-2 py-3.5 overflow-hidden">
                        <span className="px-2 py-0.5 rounded text-[10px] font-black text-txt-tertiary bg-surface-4 border border-surface-4">
                          {pl.position}
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
                              pl.devTrait === 'Elite'  ? 'bg-surface-3 border border-[#0E7A2A] text-[#22E065] shadow-[0_0_16px_rgba(14,122,42,0.85)]' :
                              pl.devTrait === 'Star'   ? 'bg-surface-3 border border-[#9C7209] text-[#FFD100] shadow-[0_0_14px_rgba(156,114,9,0.8)]' :
                              pl.devTrait === 'Impact' ? 'bg-surface-3 border border-[#7C8991] text-[#D6DEE2]' :
                              pl.devTrait === 'Normal' ? 'bg-surface-3 border border-[#8C5524] text-[#CD7F32]' :
                                                         'bg-slate-950 border border-slate-700 text-slate-600 italic'
                            }`}>
                            {hiddenDev ? 'HIDDEN' : pl.devTrait.toUpperCase()}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-3.5 text-center overflow-hidden">
                        <span className={'text-xs font-bold text-txt-tertiary'}>{gpa}</span>
                      </td>
                      <td className="px-2 py-3.5 tabular-nums text-[10px] text-txt-tertiary overflow-hidden">
                        {/* Same first-half/second-half column split as the Edit
                            modal — NOT a row-major grid (which would zigzag
                            attrs 1&2, 3&4, ... across the two columns instead
                            of grouping 1-5 and 6-10 together). */}
                        <div className="grid grid-cols-2 gap-1">
                          {(() => {
                            const half = Math.ceil(orderedAttrs.length / 2);
                            return [orderedAttrs.slice(0, half), orderedAttrs.slice(half)];
                          })().map((col, colIdx) => (
                            <div key={colIdx} className="space-y-1">
                              {col.map(([key, val]) => (
                                <span key={key} title={key} className="block px-1 py-0.5 rounded text-txt-secondary truncate bg-surface-3 border border-surface-4">
                                  <strong className="text-txt-tertiary font-normal mr-px">{ATTRIBUTE_ABBR[key] || key}:</strong>{val}
                                </span>
                              ))}
                            </div>
                          ))}
                        </div>
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
                          {(onDelete || isFromRecruitingDatabase(pl)) && (
                            <button onClick={() => handleDelete(pl)} className="p-1.5 rounded text-slate-600 hover:text-red-400 hover:bg-surface-3 transition" title="Delete prospect">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
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
