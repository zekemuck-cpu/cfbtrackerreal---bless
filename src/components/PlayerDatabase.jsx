import React, { useState, useEffect } from 'react';
import { getStaffData } from './staffDB';
import { archetypeBaseScore } from './archetypeWeights';

// ── Grade tier definitions ───────────────────────────────────────────────────
const GRADE_TIERS = [
  { grade: 'A+', min: 95, badgeCls: 'bg-emerald-950 border-emerald-500 text-emerald-200' },
  { grade: 'A',  min: 90, badgeCls: 'bg-emerald-950 border-emerald-700 text-emerald-300' },
  { grade: 'A-', min: 86, badgeCls: 'bg-emerald-950/70 border-emerald-800 text-emerald-400' },
  { grade: 'B+', min: 82, badgeCls: 'bg-sky-950 border-sky-600 text-sky-200' },
  { grade: 'B',  min: 78, badgeCls: 'bg-sky-950 border-sky-700 text-sky-300' },
  { grade: 'B-', min: 74, badgeCls: 'bg-sky-950/70 border-sky-800 text-sky-400' },
  { grade: 'C+', min: 70, badgeCls: 'bg-yellow-950 border-yellow-700 text-yellow-300' },
  { grade: 'C',  min: 66, badgeCls: 'bg-amber-950 border-amber-700 text-amber-300' },
  { grade: 'C-', min: 62, badgeCls: 'bg-amber-950/70 border-amber-800 text-amber-400' },
  { grade: 'D+', min: 58, badgeCls: 'bg-orange-950 border-orange-700 text-orange-300' },
  { grade: 'D',  min: 54, badgeCls: 'bg-orange-950/70 border-orange-800 text-orange-400' },
  { grade: 'D-', min: 50, badgeCls: 'bg-red-950/70 border-red-800 text-red-400' },
  { grade: 'F',  min: 0,  badgeCls: 'bg-red-950 border-red-700 text-red-400' },
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

function computeScore(player) {
  const devBonus  = isHiddenDev(player.devTrait) ? estimateHiddenDev(player) : getDevBonus(player.devTrait);
  const archBase  = archetypeBaseScore(player);
  const base      = archBase !== null ? archBase : calcWeightedAvg(player);
  return base + devBonus + (STAR_BONUS[String(player.stars)] ?? 0) + physOutlierBonus(player);
}

function getGradeTier(score) {
  return GRADE_TIERS.find(t => score >= t.min) ?? GRADE_TIERS[GRADE_TIERS.length - 1];
}

// ── Pool context ─────────────────────────────────────────────────────────────
function getPoolRank(player, allPlayers) {
  const group = allPlayers.filter(p => p.position === player.position);
  const sorted = [...group].sort((a, b) => computeScore(b) - computeScore(a));
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
function GradeModal({ player, allPlayers, onClose }) {
  const score      = computeScore(player);
  const baseAvg    = calcWeightedAvg(player);
  const tier       = getGradeTier(score);
  const hidden     = isHiddenDev(player.devTrait);
  const devBonus   = hidden ? estimateHiddenDev(player) : getDevBonus(player.devTrait);
  const ceilBonus  = physOutlierBonus(player);
  const starBonus  = STAR_BONUS[String(player.stars)] ?? 0;
  const combine  = generateCombine(player);
  const { gpa, major } = generateAcademic(player);
  const quote    = generateQuote(player);
  const { rank, total } = getPoolRank(player, allPlayers);
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
        className="bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
              {player.position} · {player.archetype}
            </p>
            <h2 className="text-xl font-black text-white">{player.name}</h2>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {player.stars}★ ·{' '}
              {hidden
                ? <span className="text-slate-500 italic">Dev Trait Hidden</span>
                : <span className={
                    player.devTrait === 'Elite'  ? 'text-yellow-300 font-black' :
                    player.devTrait === 'Star'   ? 'text-blue-300 font-bold' :
                    player.devTrait === 'Impact' ? 'text-orange-300 font-bold' :
                    'text-slate-400'
                  }>{player.devTrait} Dev</span>
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
          <p className="text-xs text-slate-400 leading-relaxed">{analysis}</p>

          {/* Score breakdown */}
          <section>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Score Breakdown</h3>
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden divide-y divide-slate-800/50 text-xs">
              <div className="flex justify-between px-3 py-2">
                <span className="text-slate-400">Weighted Attribute Avg</span>
                <span className="font-bold text-white">{baseAvg.toFixed(1)}</span>
              </div>
              {hidden ? (
                <div className="flex justify-between px-3 py-2">
                  <span className="text-amber-500/80 italic text-[11px]">Estimated Dev (pending reveal)</span>
                  <span className="font-bold text-amber-400">+{devBonus.toFixed(1)}</span>
                </div>
              ) : (
                <div className="flex justify-between px-3 py-2">
                  <span className="text-slate-400">{player.devTrait} Dev Adjustment</span>
                  <span className={`font-bold ${devBonus > 0 ? 'text-emerald-400' : devBonus < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                    {devBonus > 0 ? '+' : ''}{devBonus}
                  </span>
                </div>
              )}
              {ceilBonus > 0 && (
                <div className="flex justify-between px-3 py-2">
                  <span className="text-slate-400">Physical Ceiling Bonus</span>
                  <span className="font-bold text-violet-400">+{ceilBonus.toFixed(1)}</span>
                </div>
              )}
              {starBonus !== 0 && (
                <div className="flex justify-between px-3 py-2">
                  <span className="text-slate-400">{player.stars}-Star Rating Bonus</span>
                  <span className={`font-bold ${starBonus > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {starBonus > 0 ? '+' : ''}{starBonus}
                  </span>
                </div>
              )}
              <div className="flex justify-between px-3 py-2 bg-slate-900/60">
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
              <h3 className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-2">Strengths</h3>
              <div className="space-y-1.5">
                {strengths.map(([k, v]) => (
                  <div key={k} className="flex justify-between items-center bg-slate-900 border border-emerald-900/50 rounded px-2.5 py-1.5">
                    <span className="text-[10px] text-slate-300 font-medium">{k}</span>
                    <span className="text-[10px] font-black text-emerald-400">{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-red-500 mb-2">Needs Work</h3>
              <div className="space-y-1.5">
                {weaknesses.map(([k, v]) => (
                  <div key={k} className="flex justify-between items-center bg-slate-900 border border-red-900/50 rounded px-2.5 py-1.5">
                    <span className="text-[10px] text-slate-300 font-medium">{k}</span>
                    <span className="text-[10px] font-black text-red-400">{v}</span>
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
                <div key={label} className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-center">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">{label}</p>
                  <p className="text-xs font-black text-white">{value}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Academic profile */}
          <section className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg px-4 py-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Academic Profile</p>
              <p className="text-sm font-bold text-white mt-0.5">{major}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">GPA</p>
              <p className={`text-xl font-black ${
                parseFloat(gpa) >= 3.5 ? 'text-emerald-400' :
                parseFloat(gpa) >= 2.8 ? 'text-sky-400' : 'text-amber-400'
              }`}>{gpa}</p>
            </div>
          </section>

          {/* Scout interview */}
          <section className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 space-y-2">
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
const POSITIONS_LIST = ['QB','HB','WR','TE','OT','OG','C','DE','DT','OLB','MIKE','CB','FS','SS','ATH'];
const DEV_TRAITS = ['Hidden', 'Normal', 'Impact', 'Star', 'Elite'];

function EditModal({ player, onSave, onClose }) {
  const [form, setForm] = useState({
    name: player.name,
    position: player.position,
    archetype: player.archetype,
    devTrait: player.devTrait || 'Hidden',
    stars: player.stars,
    attributes: { ...player.attributes },
  });

  const setField = (field, val) => setForm(f => ({ ...f, [field]: val }));
  const setAttr  = (key, val)   => setForm(f => ({ ...f, attributes: { ...f.attributes, [key]: val } }));

  const handleSave = () => {
    const updated = {
      ...player,
      name:      form.name.trim(),
      position:  form.position,
      archetype: form.archetype.trim(),
      devTrait:  form.devTrait,
      stars:     form.stars,
      group:     form.position === 'ATH' ? 'Athlete Pipeline' : ['QB','HB','WR','TE','OT','OG','C'].includes(form.position) ? 'Offense' : 'Defense',
      attributes: Object.fromEntries(Object.entries(form.attributes).map(([k, v]) => [k, parseInt(v, 10) || 0])),
    };
    onSave(updated);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-75 flex items-center justify-center z-[9999] p-4"
      style={{ margin: 0 }}
      onClick={onClose}
    >
      <div
        className="bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">Edit Prospect</p>
            <h2 className="text-lg font-black text-white">{player.name}</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition text-lg font-bold">✕</button>
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
                  className="w-full bg-slate-900 border border-slate-700 text-xs p-2.5 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Position</label>
                <select
                  value={form.position}
                  onChange={e => setField('position', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-xs p-2.5 rounded-lg text-white focus:outline-none focus:border-emerald-500 transition"
                >
                  {POSITIONS_LIST.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Stars</label>
                <select
                  value={form.stars}
                  onChange={e => setField('stars', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-xs p-2.5 rounded-lg text-white focus:outline-none focus:border-emerald-500 transition"
                >
                  {['5','4','3','2','1'].map(s => <option key={s} value={s}>{s} Star</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Dev Trait</label>
                <select
                  value={form.devTrait}
                  onChange={e => setField('devTrait', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-xs p-2.5 rounded-lg text-white focus:outline-none focus:border-emerald-500 transition"
                >
                  {DEV_TRAITS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Archetype</label>
                <input
                  type="text"
                  value={form.archetype}
                  onChange={e => setField('archetype', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-xs p-2.5 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
                />
              </div>
            </div>
          </section>

          {/* Attributes */}
          <section>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Attributes</h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(form.attributes).map(([key, val]) => (
                <div key={key} className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2">
                  <label className="text-[10px] text-slate-400 flex-1 truncate">{key}</label>
                  <input
                    type="number"
                    min="0"
                    max="99"
                    value={val}
                    onChange={e => setAttr(key, e.target.value)}
                    className="w-14 bg-slate-950 border border-slate-700 text-xs p-1.5 rounded text-white text-center font-bold focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-black text-white transition"
          >
            Save Changes
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
export default function PlayerDatabase({ players, roleContext, teamColors, teamLogo, onDelete, onEdit, onGoToInput, onGoToThresholds }) {
  const p = teamColors?.primary || '#374151';
  const [filterPos, setFilterPos] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [editingDevFor, setEditingDevFor] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'score', dir: 'desc' });
  const [analystImg, setAnalystImg] = useState('');
  const [analystName, setAnalystName] = useState('Data Analyst');

  useEffect(() => {
    async function loadAnalyst() {
      const img  = await getStaffData('analyst_img');
      const name = await getStaffData('analyst_name');
      if (img)  setAnalystImg(img);
      if (name) setAnalystName(name);
    }
    loadAnalyst();
  }, []);

  const positionsList = ['ALL', 'QB', 'HB', 'WR', 'TE', 'OT', 'OG', 'C', 'DE', 'DT', 'OLB', 'MIKE', 'CB', 'FS', 'SS', 'ATH'];

  const filteredPlayers = players.filter(p => {
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
      case 'name':      av = a.name;                                       bv = b.name;                                       break;
      case 'score':     av = computeScore(a);                              bv = computeScore(b);                              break;
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
        className={`p-3.5 cursor-pointer select-none hover:text-white transition-colors ${active ? 'text-emerald-400' : ''} ${className}`}
        onClick={() => toggleSort(sortKey)}
      >
        <span className="inline-flex items-center gap-1">
          {children}
          <span className="text-[8px] opacity-60">
            {active ? (sortConfig.dir === 'desc' ? '▼' : '▲') : '⇅'}
          </span>
        </span>
      </th>
    );
  };

  const analystQuip = (() => {
    if (!players.length) return "Nothing in the system yet — waiting on the scout to get me some data to work with.";
    const hiddenCount = players.filter(pl => isHiddenDev(pl.devTrait)).length;
    if (hiddenCount >= 3) return `${hiddenCount} dev traits still sealed — those signing day reveals could flip this whole class ranking.`;
    if (hiddenCount > 0) return `${hiddenCount} dev trait${hiddenCount > 1 ? 's' : ''} still hidden — holding off on final grades until those come in.`;
    const topCount = players.filter(pl => ['A+','A','A-'].includes(getGradeTier(computeScore(pl)).grade)).length;
    const lowCount = players.filter(pl => ['D+','D','D-','F'].includes(getGradeTier(computeScore(pl)).grade)).length;
    if (topCount >= Math.ceil(players.length * 0.4)) return "Elite-heavy class on this board — if those dev traits hold, this group is special.";
    if (lowCount >= Math.ceil(players.length * 0.35)) return "A lot of low-ceiling prospects here — need higher dev traits to lift this board's grade.";
    const posCounts = {};
    players.forEach(pl => posCounts[pl.position] = (posCounts[pl.position] || 0) + 1);
    const top = Object.entries(posCounts).sort((a,b) => b[1]-a[1])[0];
    return `${top[0]} leads the board at ${top[1]} — watching the full class balance as more prospects come in.`;
  })();

  return (
    <div className="space-y-4">
      {selectedPlayer && (
        <GradeModal player={selectedPlayer} allPlayers={players} onClose={() => setSelectedPlayer(null)} />
      )}
      {editingPlayer && (
        <EditModal player={editingPlayer} onSave={updated => onEdit && onEdit(updated, editingPlayer)} onClose={() => setEditingPlayer(null)} />
      )}

      {/* Header strip */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {teamLogo && (
            <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ background: `${p}22`, border: `1px solid ${p}44` }}>
              <img src={teamLogo} alt="" className="w-8 h-8 object-contain" />
            </div>
          )}
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] leading-none" style={{ color: `${p}bb` }}>Scout Staff Intelligence Engine</p>
            <h2 className="text-white font-black leading-none mt-0.5" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '0.04em' }}>
              PLAYER DATABASE
            </h2>
          </div>
        </div>
        {/* Nav buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {onGoToInput && (
            <button onClick={onGoToInput} className="text-[9px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg transition" style={{ background: '#080c14', border: `1px solid ${p}25`, color: '#94a3b8' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = `${p}55`; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = `${p}25`; e.currentTarget.style.color = '#94a3b8'; }}
            >
              + New Report
            </button>
          )}
          {onGoToThresholds && (
            <button onClick={onGoToThresholds} className="text-[9px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg transition" style={{ background: '#080c14', border: `1px solid ${p}25`, color: '#94a3b8' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = `${p}55`; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = `${p}25`; e.currentTarget.style.color = '#94a3b8'; }}
            >
              Thresholds
            </button>
          )}
        </div>
      </div>

      {/* Analyst identity + filters row */}
      <div className="flex flex-col sm:flex-row gap-3 items-start">

        {/* Analyst portrait card */}
        <div className="relative rounded-xl overflow-hidden shadow-xl w-full h-40 sm:w-[110px] sm:h-[280px] sm:flex-shrink-0">
          {analystImg ? (
            <img src={analystImg} alt="Data Analyst" className="absolute inset-0 w-full h-full object-cover object-top" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: `linear-gradient(160deg, #10b98133 0%, #020617 100%)` }}>
              {teamLogo && <img src={teamLogo} alt="" className="w-12 h-12 object-contain select-none pointer-events-none" style={{ opacity: 0.12 }} />}
            </div>
          )}
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.82) 68%, rgba(0,0,0,0.92) 100%)' }} />
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, transparent 45%, #10b98155 100%)' }} />
          <div className="absolute top-2 left-2 pointer-events-none">
            <span className="text-[7px] font-black uppercase tracking-[0.15em] px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,0,0,0.6)', color: '#34d399', backdropFilter: 'blur(4px)', border: '1px solid #34d39944' }}>Analyst</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-2">
            <div className="w-4 h-0.5 mb-1 rounded-full bg-emerald-400" />
            {(() => {
              const parts = analystName.trim().split(' ');
              const last = parts.pop() || '';
              const first = parts.join(' ');
              return (
                <>
                  {first && <p className="leading-none text-[7px] font-black uppercase tracking-[0.12em]" style={{ color: 'rgba(255,255,255,0.7)', textShadow: '0 1px 6px rgba(0,0,0,1)' }}>{first}</p>}
                  <p className="text-white leading-none font-black" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.05rem', letterSpacing: '0.04em', textShadow: '0 2px 10px rgba(0,0,0,1)' }}>{last.toUpperCase()}</p>
                </>
              );
            })()}
            <p className="text-[6px] font-black uppercase tracking-[0.12em] mt-0.5 text-emerald-400">Data Analyst</p>
            <p className="text-[8px] text-white/55 italic leading-snug mt-1" style={{ textShadow: '0 1px 6px rgba(0,0,0,1)' }}>
              {players.length} prospect{players.length !== 1 ? 's' : ''} on file
            </p>
          </div>
        </div>

        {/* Right column: quip card + filters */}
        <div className="flex-1 space-y-3 min-w-0">

          {/* Analyst quip */}
          <div className="relative rounded-xl overflow-hidden" style={{ background: '#080c14', border: '1px solid #10b98120' }}>
            {teamLogo && <img src={teamLogo} alt="" className="absolute right-2 top-1/2 -translate-y-1/2 w-14 h-14 object-contain pointer-events-none select-none" style={{ opacity: 0.06 }} />}
            <div className="relative p-3.5">
              <p className="text-[8px] font-black uppercase tracking-[0.18em] leading-none text-emerald-600">Analysis</p>
              <p className="text-[11px] text-slate-300 italic leading-snug mt-1">"{analystQuip}"</p>
              <p className="text-[9px] text-slate-600 mt-1">— {analystName}</p>
            </div>
          </div>

          {/* Search + position filters */}
          <div className="rounded-xl p-3.5 space-y-2.5" style={{ background: '#080c14', border: `1px solid ${p}20` }}>
            <input
              type="text"
              placeholder="Search prospect name or archetype..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full rounded-lg text-xs p-2.5 text-slate-200 placeholder-slate-600 focus:outline-none transition"
              style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${p}22`, caretColor: 'white' }}
              onFocus={e => e.currentTarget.style.borderColor = `${p}55`}
              onBlur={e => e.currentTarget.style.borderColor = `${p}22`}
            />
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[8px] font-black uppercase tracking-[0.18em] text-slate-600 flex-shrink-0">Pos:</span>
              {positionsList.map(pos => (
                <button
                  key={pos}
                  onClick={() => setFilterPos(pos)}
                  className="text-[9px] font-black px-2 py-0.5 rounded transition uppercase tracking-wider"
                  style={filterPos === pos
                    ? { background: p, color: '#fff' }
                    : { background: 'rgba(255,255,255,0.04)', color: '#64748b', border: `1px solid ${p}18` }
                  }
                >
                  {pos}
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden shadow-xl" style={{ background: '#080c14', border: `1px solid ${p}20` }}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500" style={{ background: '#040711', borderBottom: `1px solid ${p}18` }}>
                <SortTh sortKey="name">Prospect</SortTh>
                <SortTh sortKey="score" className="text-center">Grade</SortTh>
                <SortTh sortKey="group">Group</SortTh>
                <SortTh sortKey="position">Pos</SortTh>
                <SortTh sortKey="archetype">Archetype</SortTh>
                <SortTh sortKey="stars" className="text-center">Stars</SortTh>
                <SortTh sortKey="dev">Dev</SortTh>
                <SortTh sortKey="gpa" className="text-center">GPA</SortTh>
                <th className="p-3.5 text-slate-500">Attributes</th>
                <th className="p-3.5 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y text-xs" style={{ borderColor: `${p}10` }}>
              {filteredPlayers.length === 0 ? (
                <tr>
                  <td colSpan="10" className="p-12 text-center text-slate-600 uppercase tracking-widest font-bold text-[10px]">
                    No scouting logs found matching active criteria.
                  </td>
                </tr>
              ) : (
                sortedPlayers.map((pl, i) => {
                  const score = computeScore(pl);
                  const tier  = getGradeTier(score);
                  const { gpa } = generateAcademic(pl);
                  const hiddenDev = isHiddenDev(pl.devTrait);
                  return (
                    <tr
                      key={i}
                      onClick={() => setSelectedPlayer(pl)}
                      className="transition group cursor-pointer"
                      style={{ borderColor: `${p}10` }}
                      onMouseEnter={e => e.currentTarget.style.background = `${p}0a`}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td className="p-3.5 font-bold text-slate-300 group-hover:text-white transition">{pl.name}</td>
                      <td className="p-3.5 text-center">
                        <div className="inline-flex flex-col items-center gap-0.5">
                          <span className={`font-black tracking-wide text-xs px-2 py-0.5 rounded border ${tier.badgeCls}`}>{tier.grade}</span>
                          <span className="text-[9px] font-mono text-slate-600">{score.toFixed(1)}</span>
                        </div>
                      </td>
                      <td className="p-3.5 uppercase font-black text-slate-600 text-[10px] tracking-wider">{pl.group}</td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-black text-emerald-400" style={{ background: '#022c22', border: '1px solid #10b98130' }}>
                          {pl.position}
                        </span>
                      </td>
                      <td className="p-3.5 text-slate-400 font-medium">{pl.archetype}</td>
                      <td className="p-3.5 text-center font-black text-amber-400 tracking-wide">{pl.stars}★</td>
                      <td className="p-3.5" onClick={e => e.stopPropagation()}>
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
                              pl.devTrait === 'Elite'  ? 'bg-yellow-950/50 border border-yellow-700 text-yellow-300' :
                              pl.devTrait === 'Star'   ? 'bg-blue-950/40 border border-blue-900 text-blue-300' :
                              pl.devTrait === 'Impact' ? 'bg-orange-950/40 border border-orange-900 text-orange-300' :
                              pl.devTrait === 'Normal' ? 'bg-slate-950 border border-slate-800 text-slate-500' :
                                                         'bg-slate-950 border border-slate-700 text-slate-600 italic'
                            }`}>
                            {hiddenDev ? 'Hidden' : pl.devTrait}
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-center">
                        <span className={`text-xs font-bold ${parseFloat(gpa) >= 3.5 ? 'text-emerald-400' : parseFloat(gpa) >= 2.5 ? 'text-sky-400' : 'text-amber-400'}`}>{gpa}</span>
                      </td>
                      <td className="p-3.5 font-mono text-[10px] text-slate-500 max-w-sm">
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(pl.attributes).map(([key, val]) => (
                            <span key={key} className="px-1.5 py-0.5 rounded text-slate-400 shrink-0" style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${p}15` }}>
                              <strong className="text-slate-600 font-normal mr-0.5">{key}:</strong>{val}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-3.5 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1 justify-center opacity-0 group-hover:opacity-100 transition">
                          {onEdit && (
                            <button onClick={() => setEditingPlayer(pl)} className="p-1.5 rounded text-slate-600 hover:text-sky-400 hover:bg-sky-950/40 transition" title="Edit prospect">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                              </svg>
                            </button>
                          )}
                          {onDelete && (
                            <button onClick={() => onDelete(pl)} className="p-1.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-950/40 transition" title="Delete prospect">
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
