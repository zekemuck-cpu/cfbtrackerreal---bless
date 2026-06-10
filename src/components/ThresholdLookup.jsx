import React, { useState, useEffect, useMemo } from 'react';
import { getStaffData } from './staffDB';
import { computeScore, topAttrs, normalizeArch, ARCHETYPE_WEIGHTS } from './archetypeWeights';
import { RECRUIT_FORM_OVERRIDES, BASE_POSITION_CONFIG } from './ScoutingReport';

// Resolve the exact attribute list a player at pos/arch actually has stored —
// matching the scouting form's input order rather than ARCHETYPE_WEIGHTS keys.
function getFormAttrs(pos, arch) {
  // Exact match (WR archetype overrides, ATH overrides stored with "ATH - " prefix)
  if (RECRUIT_FORM_OVERRIDES[arch]) return RECRUIT_FORM_OVERRIDES[arch];
  // OL archetypes stored as "Raw Strength (OT)" etc.
  const withSuffix = `${arch} (${pos})`;
  if (RECRUIT_FORM_OVERRIDES[withSuffix]) return RECRUIT_FORM_OVERRIDES[withSuffix];
  // ATH archetypes stored as "ATH - Thumper" etc.
  const withAth = `ATH - ${arch}`;
  if (RECRUIT_FORM_OVERRIDES[withAth]) return RECRUIT_FORM_OVERRIDES[withAth];
  // Fall back to position-level list
  return BASE_POSITION_CONFIG[pos] ?? Object.keys(ARCHETYPE_WEIGHTS[`${pos}_${arch}`] ?? {});
}

// ── Attribute short-name display map ─────────────────────────────────────────
const ATTR_SHORT = {
  'Short Accuracy':'Short Acc','Medium Accuracy':'Med Acc','Deep Accuracy':'Deep Acc',
  'Throw On Run':'Throw/Run','Under Pressure':'Undr Pres','Break Sack':'Brk Sack',
  'Change of Direction':'CoD','Break Tackle':'Brk Tkl','BC Vision':'BC Vis',
  'Catch In Traffic':'CiT','Spectacular Catch':'Spec Cth',
  'Short Route':'Shrt Rte','Medium Route':'Med Rte','Deep Route':'Deep Rte',
  'Run Block':'Run Blk','Run Block Power':'RB Pwr','Run Block Finesse':'RB Fin',
  'Pass Block':'Pass Blk','Pass Block Power':'PB Pwr','Pass Block Finesse':'PB Fin',
  'Impact Blocking':'Imp Blk','Block Shedding':'Blk Shed','Hit Power':'Hit Pwr',
  'Power Moves':'Pwr Mvs','Finesse Moves':'Fin Mvs','Play Recognition':'Play Rec',
  'Man Coverage':'Man Cov','Zone Coverage':'Zone Cov','Juke Move':'Juke',
  'Spin Move':'Spin','Throw Power':'Thr Pwr',
};

// ── Tier style definitions ────────────────────────────────────────────────────
const TIER_STYLES = [
  { label: 'Tier 1: Elite Target',          score: 'Score 88+',   border: 'border-emerald-800/60', heading: 'text-emerald-300', bg: 'bg-emerald-950/20', pill: 'bg-emerald-950 border border-emerald-700 text-emerald-300' },
  { label: 'Tier 2: Premium Star Pipeline', score: 'Score 82–87', border: 'border-sky-800/60',     heading: 'text-sky-300',     bg: 'bg-sky-950/20',     pill: 'bg-sky-950 border border-sky-700 text-sky-300' },
  { label: 'Tier 3: Core Contribution',     score: 'Score 76–81', border: 'border-amber-800/60',   heading: 'text-amber-300',   bg: 'bg-amber-950/20',   pill: 'bg-amber-950 border border-amber-700 text-amber-300' },
  { label: 'Tier 4: Roster Depth',          score: 'Under 76',    border: 'border-red-900/60',     heading: 'text-red-400',     bg: 'bg-red-950/20',     pill: 'bg-red-950 border border-red-800 text-red-400' },
];

// t(key1, key2, condition) shorthand
const t = (k1, k2, cond) => ({ k1, k2, cond });

// ── Archetype-level threshold profiles ───────────────────────────────────────
const PROFILES = {
  QB: {
    archetypes: ['Pocket Passer', 'Dual Threat', 'Backfield Creator', 'Pure Runner'],
    'Pocket Passer': { tiers: [
      t('Throw Power 90+ / Short Acc 88+', 'Med Acc 87+ / Under Pressure 85+', 'Elite accuracy in all three zones with elite composure. The gold standard Pocket Passer — can dissect any coverage from a clean or dirty pocket.'),
      t('Throw Power 84+ / Short Acc 82+', 'Med Acc 81+ / Under Pressure 79+', 'Above-average accuracy with reliable decision-making under pressure. Projects as a multi-year starter who improves with experience.'),
      t('Throw Power 76+ / Short Acc 75+', 'Med Acc 74+ / Under Pressure 73+', 'Functional passer who needs ideal situations to produce. Limited range may restrict usage to short/intermediate concepts.'),
      t('Below accuracy benchmarks', 'Under 76 composite', 'Raw pocket passer who needs significant development. Accuracy inconsistency at this tier makes contributions at a high level unlikely near-term.'),
    ]},
    'Dual Threat': { tiers: [
      t('Speed 90+ / Throw On Run 87+', 'Acceleration 86+ / Throw Power 85+', 'Elite in both run and pass dimensions — the rarest QB prospect. Defenses cannot commit to stopping one phase, making this player impossible to scheme against.'),
      t('Speed 84+ / Throw On Run 82+', 'Acceleration 81+ / Throw Power 80+', 'Legitimate threat in both areas with clear passing upside. Can exploit run-pass option looks and extend plays effectively with development.'),
      t('Speed 77+ / Throw On Run 75+', 'Acceleration 74+ / Throw Power 73+', 'Dangerous with legs but passing consistency is a limiting factor. Best in college systems that lean heavily on designed run concepts.'),
      t('Below dual benchmarks', 'Under 76 composite', 'Neither element is developed enough to create a true dual threat advantage. Needs significant work at either arm talent or speed before contributing.'),
    ]},
    'Backfield Creator': { tiers: [
      t('Throw On Run 90+ / Short Acc 87+', 'Break Sack 86+ / Throw Power 85+', 'Elite playmaker who thrives in chaos — plays best when the pocket collapses. Off-schedule throws and improvisational ability at this tier is genuinely special.'),
      t('Throw On Run 84+ / Short Acc 81+', 'Break Sack 80+ / Throw Power 79+', 'Above-average off-schedule passer who consistently extends plays. Can manufacture completions that conventional QBs cannot and keeps defenses guessing.'),
      t('Throw On Run 77+ / Short Acc 75+', 'Break Sack 73+', 'Shows flashes of creativity but inconsistency limits reliability. Best as a backup or in limited usage concepts that give him structure.'),
      t('Below creator benchmarks', 'Under 76 composite', 'Playmaking instincts are raw and haven\'t translated to consistent execution. Needs structured development before the improvisation becomes a real weapon.'),
    ]},
    'Pure Runner': { tiers: [
      t('Speed 93+ / Acceleration 91+', 'Throw On Run 86+', 'Elite rushing weapon who functions as an RB from the QB position. Ball security and vision at this tier make the position genuinely unstoppable without dedicated spy assignments.'),
      t('Speed 87+ / Acceleration 85+', 'Throw On Run 81+', 'Dangerous QB runner who creates consistent positive plays. A strong enough rusher to be a featured element of the offense even without elite passing.'),
      t('Speed 80+ / Acceleration 78+', 'Throw On Run 73+', 'Mobile enough to use in designed runs but lacks the elite speed to make this a consistent feature. Needs complementary passing ability to remain on the field.'),
      t('Below running benchmarks', 'Under 76 composite', 'Neither the speed nor execution to be a reliable run option from QB. Limited role without significant athletic improvement.'),
    ]},
  },

  HB: {
    archetypes: ['Elusive Bruiser', 'East/West Playmaker', 'Contact Seeker', 'Backfield Threat', 'North/South Receiver', 'North/South Blocker'],
    'Elusive Bruiser': { tiers: [
      t('Break Tackle 91+ / Juke Move 88+', 'Speed 87+ / Acceleration 85+', 'Elite open-field runner who makes defenders miss in a phone booth. Break tackle and juke at this tier makes the first man in space essentially a guaranteed miss.'),
      t('Break Tackle 85+ / Juke Move 83+', 'Speed 82+ / Acceleration 81+', 'Above-average elusiveness who creates yardage after contact consistently. Projects as a featured back who produces regardless of blocking quality.'),
      t('Break Tackle 77+ / Juke Move 76+', 'Speed 76+', 'Shows elusiveness but lacks the elite agility to be a true mismatch. Contributes as a change-of-pace option within a rotation.'),
      t('Below elusive benchmarks', 'Under 76 composite', 'Insufficient agility to be a true elusive back at this level. Better suited in a complementary role while developing lateral quickness.'),
    ]},
    'East/West Playmaker': { tiers: [
      t('Speed 90+ / Acceleration 88+', 'CoD 87+ / Juke Move 86+', 'Elite lateral playmaker with the speed to turn any outside run into a big gain. Change of direction and burst at this tier makes the first man in space irrelevant.'),
      t('Speed 84+ / Acceleration 82+', 'CoD 81+ / Juke Move 80+', 'Above-average east/west threat who stresses defenses horizontally. Creates explosive plays in the open field and is dangerous in the screen and jet game.'),
      t('Speed 77+ / Acceleration 76+', 'CoD 74+', 'Functional east/west back who contributes as a change-of-pace option. Lacks the elite speed or agility to be a featured horizontal threat.'),
      t('Below east/west benchmarks', 'Under 76 composite', 'Speed and lateral agility insufficient to make the east/west concept work at this level. Needs athletic development.'),
    ]},
    'Contact Seeker': { tiers: [
      t('Break Tackle 91+ / Carrying 89+', 'BC Vision 84+ / Awareness 82+', 'Punishing back who actively seeks out contact and converts it into positive yardage. Elite physicality makes them nearly impossible to tackle without gang pursuit.'),
      t('Break Tackle 85+ / Carrying 83+', 'BC Vision 79+', 'Physical downhill runner who consistently creates extra yards after contact. Best when given interior runs that let his power work without needing open field.'),
      t('Break Tackle 77+ / Carrying 76+', 'BC Vision 72+', 'Contact tolerant but lacking the elite power to truly bully defenders. Short-yardage specialist who needs a clear design to be effective.'),
      t('Below contact benchmarks', 'Under 76 composite', 'Not physical enough to be a true contact seeker at this level. Needs to develop strength and tackle breaking ability before the archetype functions.'),
    ]},
    'Backfield Threat': { tiers: [
      t('Catching 90+ / Speed 87+', 'Acceleration 86+ / CoD 84+', 'Elite pass-catching back who can also contribute as a runner. Catching and speed at this tier creates a two-phase mismatch in the backfield — impossible to handle with a single linebacker.'),
      t('Catching 84+ / Speed 82+', 'Acceleration 81+ / CoD 80+', 'Reliable backfield weapon who commands attention in the passing game. Contributes on screens, check-downs, and designed receiving concepts with above-average run ability.'),
      t('Catching 76+ / Speed 75+', 'Acceleration 73+', 'Serviceable pass-catcher out of the backfield with some run threat. Not yet dominant enough in either dimension to force defensive adjustments.'),
      t('Below backfield threat benchmarks', 'Under 76 composite', 'Catching and athleticism insufficient to be a featured backfield threat at this level. Needs development in both receiving and run dimensions.'),
    ]},
    'North/South Receiver': { tiers: [
      t('Speed 89+ / Catching 87+', 'BC Vision 84+ / Acceleration 83+', 'Elite pass-catching back who doubles as a genuine running threat north-south. Catching and vision at this tier creates a two-phase mismatch that linebackers cannot solve.'),
      t('Speed 83+ / Catching 81+', 'BC Vision 79+ / Acceleration 80+', 'Reliable receiving back who adds a meaningful passing dimension to straight-line run concepts. Contributes on third downs and in two-minute drill.'),
      t('Speed 77+ / Catching 74+', 'BC Vision 73+', 'Serviceable receiver out of the backfield in limited packages. Not a featured element but can execute specific receiving concepts.'),
      t('Below receiver benchmarks', 'Under 76 composite', 'Hands or vision not yet at the level for the receiving back role. Projects as a run-only option until pass-catching develops.'),
    ]},
    'North/South Blocker': { tiers: [
      t('Carrying 89+ / Break Tackle 87+', 'Awareness 85+ / BC Vision 84+', 'Elite downhill blocker-back who punishes defenders AND carries the load between the tackles. The rarest HB archetype — dominates in short-yardage and makes every run-block concept more dangerous.'),
      t('Carrying 83+ / Break Tackle 81+', 'Awareness 81+ / BC Vision 80+', 'Physical north-south back who blocks well, falls forward, and converts tough interior runs. A foundational piece for ground-and-pound offensive identities.'),
      t('Carrying 76+ / Break Tackle 74+', 'Awareness 73+', 'Physical back who contributes in short-yardage and goal line but lacks the dominance for a featured north-south role.'),
      t('Below blocker benchmarks', 'Under 76 composite', 'Not yet strong or aware enough to be the featured north-south blocker back at this level. Needs physical development.'),
    ]},
  },

  WR: {
    archetypes: ['Speedster', 'Route Artist', 'Elusive Route Runner', 'Physical Route Runner', 'Gritty Possession', 'Contested Specialist', 'Gadget'],
    'Speedster': { tiers: [
      t('Speed 93+ / Acceleration 91+', 'Deep Route 84+ / Spectacular Catch 81+', 'Elite burner who takes the top off any defense. Speed at this tier forces single-high adjustments that open the entire underneath game — a cheat code for any offense.'),
      t('Speed 87+ / Acceleration 85+', 'Deep Route 79+', 'Above-average speed threat who commands safety attention. Deep ball danger that requires defensive preparation on every snap.'),
      t('Speed 80+ / Acceleration 78+', 'Deep Route 74+', 'Fast enough to be a downfield threat but not elite enough to consistently separate at the top of routes against quality corners.'),
      t('Below speedster benchmarks', 'Under 76 composite', 'Speed is not yet a weapon at this level. Needs to develop a technical dimension to compensate for the lack of elite athleticism.'),
    ]},
    'Route Artist': { tiers: [
      t('Short Route 90+ / Med Route 88+', 'Catching 87+ / Deep Route 85+', 'Elite technical separator who gets open regardless of coverage. Route artistry at this tier creates clean separation without needing elite athleticism — the most coachable receiver in any class.'),
      t('Short Route 84+ / Med Route 82+', 'Catching 81+ / Deep Route 79+', 'Sharp route runner with clean mechanics at every depth. Consistently finds separation and is a high-percentage target in structured passing concepts.'),
      t('Short Route 77+ / Med Route 75+', 'Catching 74+', 'Developing route runner with fundamentals in place. Not yet precise enough to consistently beat press but progressing toward reliability in the short game.'),
      t('Below route benchmarks', 'Under 76 composite', 'Technical route running is not yet a functional weapon. Needs significant footwork and release development before the archetype produces at this level.'),
    ]},
    'Elusive Route Runner': { tiers: [
      t('Agility 90+ / Short Route 88+', 'Speed 87+ / Med Route 85+', 'Elite slot weapon who combines razor-sharp route precision with exceptional elusiveness after the catch. Nearly untackleable in space.'),
      t('Agility 84+ / Short Route 82+', 'Speed 81+ / Med Route 80+', 'Shifty receiver who creates YAC consistently and stresses linebackers and zone coverage. Above-average in short and intermediate concepts.'),
      t('Agility 77+ / Short Route 75+', 'Speed 74+', 'Shows elusiveness but not yet reliable enough to stress coverage in a featured role. Best in complementary packages.'),
      t('Below elusive benchmarks', 'Under 76 composite', 'Agility and route footwork insufficient to create separation as an elusive receiver at this level.'),
    ]},
    'Physical Route Runner': { tiers: [
      t('CiT 90+ / Med Route 88+', 'Catching 87+ / Spectacular Catch 85+', 'Big, precise receiver who wins contested catches and runs technically sound routes across the middle. Defensive backs cannot hold up physically against this tier.'),
      t('CiT 84+ / Med Route 82+', 'Catching 81+', 'Physical pass catcher who is reliable in traffic and tough routes. Projects as a starting receiver who wins contested opportunities.'),
      t('CiT 77+ / Med Route 74+', 'Catching 73+', 'Physical but not yet polished enough in routes to be a consistent target. Contributes in specific packages where physicality is the primary asset.'),
      t('Below physical benchmarks', 'Under 76 composite', 'Neither the physicality nor the route precision to be a featured physical route runner. Needs development in both dimensions.'),
    ]},
    'Gritty Possession': { tiers: [
      t('CiT 90+ / Catching 88+', 'Short Route 86+ / Med Route 83+', 'Elite possession receiver who catches everything thrown his way in traffic. Reliable target in two-minute drill and critical third-down situations.'),
      t('CiT 84+ / Catching 83+', 'Short Route 80+ / Med Route 79+', 'Dependable possession threat who converts contested opportunities. A chain-moving target who reduces turnover risk on critical downs.'),
      t('CiT 76+ / Catching 75+', 'Short Route 74+', 'Decent possession option in short-area concepts but not reliable enough to be a go-to target in critical situations.'),
      t('Below possession benchmarks', 'Under 76 composite', 'Hands and traffic awareness not at the standard for a possession receiver. Needs significant development in catch technique.'),
    ]},
    'Contested Specialist': { tiers: [
      t('Spectacular Catch 91+ / CiT 88+', 'Catching 87+ / Deep Route 84+', 'Elite jump-ball weapon who wins 50/50 balls at an absurd rate. Throw it anywhere in their area code — they will come down with it. A red zone weapon unlike any other.'),
      t('Spectacular Catch 85+ / CiT 82+', 'Catching 82+ / Deep Route 79+', 'Above-average contested catcher who makes plays in crowded areas. A reliable red zone option and trustworthy target when the window is tight.'),
      t('Spectacular Catch 78+ / CiT 76+', 'Catching 74+', 'Can make some contested catches but not consistently reliable in traffic. Best used as a fourth option rather than a featured contested target.'),
      t('Below contested benchmarks', 'Under 76 composite', 'Contested catch ability not yet at a level that creates separation as a go-to target in tight-window situations.'),
    ]},
    'Gadget': { tiers: [
      t('Speed 90+ / Acceleration 88+', 'Agility 86+ / Catching 85+', 'Elite gadget weapon who threatens as a receiver, runner, and all-around playmaker simultaneously. Defensive coordinators must account for all dimensions on every snap — a true multiplier.'),
      t('Speed 84+ / Acceleration 82+', 'Agility 81+ / Catching 80+', 'Versatile gadget contributor who keeps defenses honest with multi-dimensional potential. Valuable in creative offensive packages.'),
      t('Speed 77+ / Acceleration 75+', 'Agility 73+', 'Serviceable in gadget packages but not a consistent enough threat in any individual dimension to force defensive adjustments.'),
      t('Below gadget benchmarks', 'Under 76 composite', 'Speed and athleticism not yet developed enough to create genuine gadget concerns. More of a positional hybrid than a true gadget weapon.'),
    ]},
  },

  TE: {
    archetypes: ['Vertical Threat', 'Pure Possession', 'Gritty Possession', 'Physical Route Runner', 'Pure Blocker'],
    'Vertical Threat': { tiers: [
      t('Speed 89+ / Acceleration 87+', 'Med Route 84+ / Catching 83+', 'Elite receiving weapon who cannot be covered by a single defender. Speed-catching combination at this tier forces defensive coordinators to dedicate two hats — a luxury for any offense.'),
      t('Speed 83+ / Acceleration 82+', 'Med Route 81+ / Catching 80+', 'Legitimate vertical threat who creates explosive plays and forces safety rotation. Above-average separation in the seam and down the hash.'),
      t('Speed 77+ / Acceleration 75+', 'Catching 73+', 'Shows vertical ability but not fast enough to consistently win downfield against collegiate athleticism. Better in 15-yard and under concepts.'),
      t('Below vertical benchmarks', 'Under 76 composite', 'Speed or receiving ability insufficient to be a functional vertical TE. Needs to develop into a blocking or short-area role first.'),
    ]},
    'Pure Possession': { tiers: [
      t('Catching 89+ / CiT 87+', 'Short Route 85+ / Med Route 83+', 'Elite safety valve who never drops the ball and thrives in the middle of the field. Route precision and hands at this tier makes him the most reliable target in any concept.'),
      t('Catching 83+ / CiT 82+', 'Short Route 80+ / Med Route 79+', 'Dependable possession TE who converts tough catches and moves the chains. A go-to target in critical third-down situations.'),
      t('Catching 76+ / CiT 74+', 'Short Route 73+', 'Serviceable possession option in limited packages but lacks the elite hands or route running to be a featured target.'),
      t('Below possession benchmarks', 'Under 76 composite', 'Receiving ability not yet at standard for the role. Needs to develop a blocking dimension to contribute until pass-catching improves.'),
    ]},
    'Gritty Possession': { tiers: [
      t('CiT 90+ / Short Route 87+', 'Catching 85+ / Strength 83+', 'Physical possession monster who wins in traffic and contested situations. Defensive backs cannot match his combination of size and reliable hands in tight windows.'),
      t('CiT 84+ / Short Route 81+', 'Catching 81+ / Strength 79+', 'Tough, reliable target who converts difficult receptions. Valuable in red zone and short-yardage concepts where physicality wins.'),
      t('CiT 76+ / Short Route 74+', 'Catching 74+', 'Shows toughness in routes but lacking consistency in the most demanding catch situations. Role player in specific down-and-distance packages.'),
      t('Below gritty benchmarks', 'Under 76 composite', 'Not yet physical enough in traffic to deliver on the gritty possession archetype. Needs strength and technique development.'),
    ]},
    'Physical Route Runner': { tiers: [
      t('Med Route 89+ / CiT 86+', 'Catching 85+ / Strength 83+', 'Complete receiving TE who wins with precise routes AND physicality. The rarest archetype at the position — creates mismatches against both linebackers and corners.'),
      t('Med Route 83+ / CiT 81+', 'Catching 80+ / Strength 79+', 'Above-average route runner with enough physicality to win in contact. Can operate as a traditional inline TE and a move TE in the same game.'),
      t('Med Route 76+ / CiT 74+', 'Catching 73+', 'Developing route runner with physicality assets. Not yet refined enough to consistently beat coverage but showing traits worth developing.'),
      t('Below route benchmarks', 'Under 76 composite', 'Route precision and physicality both underdeveloped for the role. Needs to establish one dimension before combining them at this level.'),
    ]},
    'Pure Blocker': { tiers: [
      t('Run Block 91+ / Pass Block 88+', 'Strength 87+ / Impact Block 84+', 'Dominant in-line blocker who physically eliminates defenders at the point of attack. A true tone-setter who enables the entire ground game and keeps the pocket clean.'),
      t('Run Block 85+ / Pass Block 82+', 'Strength 83+ / Impact Block 80+', 'Reliable blocker who holds his own in all phases. Projects as a starting TE who elevates run game production and provides security in protection.'),
      t('Run Block 77+ / Pass Block 75+', 'Strength 74+', 'Functional blocker in specific schemes. Not yet dominant enough to anchor the run game alone but contributes reliably in a limited role.'),
      t('Below blocker benchmarks', 'Under 76 composite', 'Blocking technique and strength not yet at a standard to contribute meaningfully in the front. Needs a significant development investment.'),
    ]},
  },

  OT: {
    archetypes: ['Well Rounded', 'Pass Protector', 'Agile', 'Raw Strength'],
    'Well Rounded': { tiers: [
      t('Run Block 89+ / Pass Block 87+', 'RBP 85+ / PBP 84+', 'Elite in both phases — the complete left tackle package. Does not give away a weakness to the defense and can anchor in any game situation.'),
      t('Run Block 83+ / Pass Block 81+', 'RBP 79+ / PBP 78+', 'Solid in both blocking dimensions. Projects as a multi-year starter who won\'t get teams into trouble in either phase.'),
      t('Run Block 76+ / Pass Block 75+', 'RBP 73+ / PBP 72+', 'Serviceable across the board but without an elite dimension. Contributes as a rotational player or starter in a system that doesn\'t stress any single phase.'),
      t('Below balanced benchmarks', 'Under 76 composite', 'Not yet reliable enough in either dimension. Needs to develop a primary skill before the balanced profile can become an asset.'),
    ]},
    'Pass Protector': { tiers: [
      t('Pass Block 91+ / PBP 88+', 'Pass Block Finesse 86+', 'Elite pass protector who neutralizes any edge rusher. Combining power and finesse at this tier is what franchise left tackles are made of.'),
      t('Pass Block 85+ / PBP 82+', 'Pass Block Finesse 80+', 'Above-average in pass protection with reliable technique in both dimensions. QB confidence in this tackle\'s ability to win is well-founded.'),
      t('Pass Block 77+ / PBP 75+', 'Pass Block Finesse 74+', 'Functional in protection against standard rushers. Elite pass rush matchups can expose weaknesses — best at a school with quality TE help.'),
      t('Below protection benchmarks', 'Under 76 composite', 'Pass protection not yet at a standard to reliably protect the QB. High-quality pass rushers will present problems regularly.'),
    ]},
    'Agile': { tiers: [
      t('Pass Block Finesse 90+ / Run Block Finesse 88+', 'Agility 87+ / Acceleration 84+', 'Elite athlete on the offensive line who dominates in zone blocking schemes and wins with footwork in pass sets. The ideal fit for spread concepts.'),
      t('Pass Block Finesse 84+ / Run Block Finesse 82+', 'Agility 81+ / Acceleration 80+', 'Above-average movement for the position. Projects as a strong zone blocker who can execute reach blocks and second-level assignments.'),
      t('Pass Block Finesse 77+ / Run Block Finesse 75+', 'Agility 73+', 'Above-average athleticism for the OT position. Shows flashes in movement-based concepts but not yet consistent in technique.'),
      t('Below agile benchmarks', 'Under 76 composite', 'Athleticism insufficient to be the defining trait of this archetype at this level. Needs to develop technique to compensate.'),
    ]},
    'Raw Strength': { tiers: [
      t('Run Block Power 91+ / PBP 88+', 'Impact Block 87+', 'Dominant power tackle who physically overwhelms defenders at the point of attack. A force of nature in the run game and an immovable object in pass protection.'),
      t('Run Block Power 85+ / PBP 82+', 'Impact Block 82+', 'Physical mauler who creates consistent push in the run game and holds up against power rushers. Valuable in ground-and-pound offensive schemes.'),
      t('Run Block Power 77+ / PBP 75+', 'Impact Block 74+', 'Strong but technique is raw. Can win with physicality against overmatched defenders but struggles against sophisticated rushers.'),
      t('Below strength benchmarks', 'Under 76 composite', 'Strength profile not yet at the level to justify the raw strength designation. Needs a significant physical development commitment.'),
    ]},
  },

  OG: {
    archetypes: ['Well Rounded', 'Pass Protector', 'Agile', 'Raw Strength'],
    'Well Rounded': { tiers: [
      t('Run Block 89+ / Pass Block 87+', 'RBP 85+ / PBP 84+', 'Complete interior lineman who does not have an exploitable weakness. Dominant in both phases — the ideal center of the offensive line.'),
      t('Run Block 83+ / Pass Block 81+', 'RBP 79+ / PBP 78+', 'Reliable starter on the interior who contributes consistently in both phases. A steady presence who won\'t hurt the offense in any situation.'),
      t('Run Block 76+ / Pass Block 75+', 'RBP 73+ / PBP 72+', 'Functional guard who fills a roster need. Not yet elite in either dimension but capable of contributing in the right system.'),
      t('Below balanced benchmarks', 'Under 76 composite', 'Neither run blocking nor pass blocking developed enough to contribute consistently. Needs a primary skill established first.'),
    ]},
    'Pass Protector': { tiers: [
      t('Pass Block 91+ / PBP 88+', 'Pass Block Finesse 86+', 'Elite interior pass protector who neutralizes interior rushers on every snap. Anchors the pocket and gives the QB a clean environment to operate.'),
      t('Pass Block 85+ / PBP 82+', 'Pass Block Finesse 80+', 'Above-average protection guard who holds his own against most interior rushers. A reliable piece for pass-heavy offensive systems.'),
      t('Pass Block 77+ / PBP 75+', 'Pass Block Finesse 73+', 'Developing pass protector with the foundation in place. Needs refinement against elite pass rushers but can contribute in protection-heavy packages.'),
      t('Below protection benchmarks', 'Under 76 composite', 'Interior pass protection is a liability at this tier. Teams must account for the weakness with scheme or personnel.'),
    ]},
    'Agile': { tiers: [
      t('Run Block Finesse 90+ / Pass Block Finesse 87+', 'Agility 86+ / Acceleration 85+', 'Elite movement guard ideal for zone and pull-blocking schemes. Athleticism allows him to reach defenders downfield that traditional guards cannot.'),
      t('Run Block Finesse 84+ / Pass Block Finesse 81+', 'Agility 80+ / Acceleration 79+', 'Athletic guard who excels in space. Valuable in outside zone runs and screen game protection where quick feet make the difference.'),
      t('Run Block Finesse 77+ / Pass Block Finesse 74+', 'Agility 73+', 'Above-average athleticism for a guard. Can execute zone concepts but technique needs work to translate athleticism into consistent production.'),
      t('Below agile benchmarks', 'Under 76 composite', 'Not athletic enough for the movement demands of the agile guard archetype at this level.'),
    ]},
    'Raw Strength': { tiers: [
      t('Run Block Power 91+ / PBP 89+', 'Impact Block 88+', 'Physically dominant interior guard who creates movement in the run game and stops power rushers cold. A tone-setter for the entire offense.'),
      t('Run Block Power 85+ / PBP 83+', 'Impact Block 82+', 'Powerful guard who pancakes defenders and creates consistent rushing lanes. Best in power and inside zone run concepts.'),
      t('Run Block Power 77+ / PBP 75+', 'Impact Block 74+', 'Physical but technique is incomplete. Can win power matchups but needs coaching to translate strength into consistent run production.'),
      t('Below strength benchmarks', 'Under 76 composite', 'Strength profile not yet sufficient for the Raw Strength archetype demands. Needs physical development before the power game becomes reliable.'),
    ]},
  },

  C: {
    archetypes: ['Well Rounded', 'Pass Protector', 'Agile', 'Raw Strength'],
    'Well Rounded': { tiers: [
      t('Run Block 89+ / Pass Block 87+', 'Awareness 85+ / RBP 83+', 'Complete center who makes protection calls, dominates in both blocking dimensions, and elevates every lineman around him. The rarest and most valuable interior lineman in recruiting.'),
      t('Run Block 83+ / Pass Block 81+', 'Awareness 80+ / RBP 79+', 'Smart, reliable center who runs the protection scheme effectively and contributes in both phases. A foundation piece for any offensive line.'),
      t('Run Block 76+ / Pass Block 74+', 'Awareness 73+', 'Functional center for straightforward protection concepts. May struggle with complex schemes but can handle basic assignments reliably.'),
      t('Below balanced benchmarks', 'Under 76 composite', 'Not yet ready to run an offensive line from the center position. Awareness and blocking dimensions both need development.'),
    ]},
    'Pass Protector': { tiers: [
      t('Pass Block 90+ / PBP 87+', 'Pass Block Finesse 85+ / Awareness 84+', 'Elite pass-protecting center with the awareness to identify stunts, blitzes, and twists in real time. Anchors the pocket from the inside out.'),
      t('Pass Block 84+ / PBP 81+', 'Pass Block Finesse 80+ / Awareness 79+', 'Above-average pass protection center who communicates well and holds up against interior rushers. Provides security in passing situations.'),
      t('Pass Block 76+ / PBP 74+', 'Pass Block Finesse 73+', 'Developing pass protector at the position. Can handle basic protection calls but complex blitz packages may expose him.'),
      t('Below protection benchmarks', 'Under 76 composite', 'Pass protection from the center position is insufficient. Scheme must compensate with guards or a quick passing game.'),
    ]},
    'Agile': { tiers: [
      t('Run Block Finesse 90+ / Pass Block Finesse 87+', 'Agility 86+ / Awareness 84+', 'Athletic center elite in zone blocking and reach blocking. Excels in outside zone schemes that require the center to combo up to the second level quickly.'),
      t('Run Block Finesse 84+ / Pass Block Finesse 81+', 'Agility 80+ / Awareness 79+', 'Above-average athleticism for the center position. Executes zone concepts cleanly and can reach interior defenders to spring cutback lanes.'),
      t('Run Block Finesse 77+ / Pass Block Finesse 74+', 'Agility 73+', 'More athletic than average at center but technique needs refinement. Capable in zone concepts with adequate development.'),
      t('Below agile benchmarks', 'Under 76 composite', 'Athleticism not sufficient to be a featured advantage at the center position at this level.'),
    ]},
    'Raw Strength': { tiers: [
      t('Run Block Power 90+ / PBP 88+', 'Impact Block 87+ / Awareness 84+', 'Dominant power center who anchors the interior run game AND has the intelligence to handle protection calls. Elite and rare combination.'),
      t('Run Block Power 84+ / PBP 82+', 'Impact Block 81+ / Awareness 79+', 'Physical center with reliable strength in both phases. Creates movement in the run game and holds up against bull rushers in protection.'),
      t('Run Block Power 76+ / PBP 74+', 'Impact Block 73+', 'Strong at the position but lacking the awareness or technique to be elite. Best in power-run schemes that minimize protection complexity.'),
      t('Below strength benchmarks', 'Under 76 composite', 'Strength profile incomplete for the raw strength archetype at the center level. Physical development needed before the power game functions reliably.'),
    ]},
  },

  DE: {
    archetypes: ['Speed Rusher', 'Power Rusher', 'Edge Setter', 'Pure Power'],
    'Speed Rusher': { tiers: [
      t('Finesse Moves 91+ / Speed 89+', 'Acceleration 88+ / Pursuit 83+', 'Elite speed rusher who cannot be neutralized by a single blocker. First-step burst at this tier crosses the line before offensive tackles can set — a genuine game-wrecker.'),
      t('Finesse Moves 85+ / Speed 84+', 'Acceleration 83+ / Pursuit 80+', 'Above-average edge speed who creates consistent pressure and forces quick throws. Projects as a starter who contributes in both pass rush and run defense.'),
      t('Finesse Moves 78+ / Speed 77+', 'Acceleration 76+', 'Fast enough to be a threat in pass rush but relies on schematic advantages to create pressure. Contributes as a situational rusher.'),
      t('Below speed benchmarks', 'Under 76 composite', 'Speed insufficient to be the primary weapon as a speed rusher at this level. Needs complementary development.'),
    ]},
    'Power Rusher': { tiers: [
      t('Power Moves 91+ / Strength 88+', 'Block Shedding 87+ / Hit Power 84+', 'Physically dominant edge rusher who overpowers offensive tackles. Power moves at this tier are impossible to anchor against — creates a push-the-pocket impact even against double teams.'),
      t('Power Moves 85+ / Strength 83+', 'Block Shedding 82+ / Hit Power 80+', 'Above-average power rusher who wins physical matchups and creates consistent pocket push. Projects as a featured pass rusher in a four-down front.'),
      t('Power Moves 78+ / Strength 76+', 'Block Shedding 74+', 'Developing power end who contributes in run defense and shows pass rush potential. Not yet dominant but physical traits are projectable.'),
      t('Below power benchmarks', 'Under 76 composite', 'Not yet strong enough to win consistently as a power rusher at this level. Needs weight room development before the archetype functions.'),
    ]},
    'Edge Setter': { tiers: [
      t('Block Shedding 90+ / Tackle 87+', 'Hit Power 86+ / Strength 84+', 'Elite edge defender who physically controls the line of scrimmage and eliminates outside runs before they start. Block shedding at this tier is impossible to seal — the most reliable run defender on any front.'),
      t('Block Shedding 84+ / Tackle 82+', 'Hit Power 83+ / Strength 80+', 'Reliable edge setter who holds the corner consistently and forces inside runs. A starting-caliber defender who gives the front a physical identity.'),
      t('Block Shedding 77+ / Tackle 76+', 'Strength 74+', 'Developing edge defender with physicality but not yet dominant enough to set the edge against power concepts without assistance.'),
      t('Below edge benchmarks', 'Under 76 composite', 'Not yet physical enough to be a reliable edge setter at this level. Needs strength and block-shedding development.'),
    ]},
    'Pure Power': { tiers: [
      t('Power Moves 91+ / Strength 88+', 'Block Shedding 86+ / Hit Power 85+', 'Devastating interior power rusher who cannot be anchored by a single blocker. Power moves at this tier collapse pockets and demand double teams every snap.'),
      t('Power Moves 85+ / Strength 83+', 'Block Shedding 82+', 'Above-average power rusher who forces double teams and creates consistent interior push. A featured pass rusher in any four-man front.'),
      t('Power Moves 78+ / Strength 77+', 'Block Shedding 75+', 'Shows power rush potential with developing technique. Needs refinement to consistently win one-on-one matchups against trained blockers.'),
      t('Below power benchmarks', 'Under 76 composite', 'Strength and power moves not yet developed to be a featured interior power rusher. Significant weight room investment needed.'),
    ]},
  },

  DT: {
    archetypes: ['Speed Rusher', 'Power Rusher', 'Edge Setter', 'Pure Power', 'Gap Specialist'],
    'Speed Rusher': { tiers: [
      t('Finesse Moves 91+ / Speed 88+', 'Acceleration 87+ / Pursuit 83+', 'Elite interior athlete who beats the line to the gap before they can react. First-step quickness at this tier collapses the pocket from inside and disrupts every interior run.'),
      t('Finesse Moves 85+ / Speed 83+', 'Acceleration 82+ / Pursuit 79+', 'Above-average quickness for an interior lineman. Creates penetration and forces offensive lines to account for his burst on every snap.'),
      t('Finesse Moves 78+ / Speed 76+', 'Acceleration 75+', 'Quick for the position but not yet elite enough to consistently beat the line to the gap. Best in designed stunts and games.'),
      t('Below speed benchmarks', 'Under 76 composite', 'Quickness not yet sufficient to be the defining trait as a speed DT at this level.'),
    ]},
    'Power Rusher': { tiers: [
      t('Power Moves 91+ / Strength 88+', 'Block Shedding 87+ / Hit Power 84+', 'Immovable force at the point of attack who draws double teams on every play. Strength and power moves at this tier cannot be handled by a single blocker.'),
      t('Power Moves 85+ / Strength 83+', 'Block Shedding 82+ / Hit Power 80+', 'Physical DT who holds the line and creates consistent interior disruption. A foundation piece for any defensive front.'),
      t('Power Moves 78+ / Strength 76+', 'Block Shedding 74+', 'Physical presence not yet dominant enough to single-handedly control the interior. Functional two-down run stuffer.'),
      t('Below power benchmarks', 'Under 76 composite', 'Not yet strong enough to hold the point of attack against college linemen. Needs major physical development.'),
    ]},
    'Edge Setter': { tiers: [
      t('Block Shedding 91+ / Tackle 87+', 'Hit Power 86+ / Strength 84+', 'Dominant interior edge setter who controls the A/B gap assignment and eliminates cutback lanes. Block shedding at this tier makes interior run game impossible to execute.'),
      t('Block Shedding 85+ / Tackle 82+', 'Hit Power 83+ / Strength 81+', 'Reliable interior disruptor who holds his gap assignment and creates problems for zone run concepts. A starting-caliber run defender.'),
      t('Block Shedding 77+ / Tackle 75+', 'Hit Power 74+', 'Developing interior defender who shows the tools but needs refinement in technique and physicality to be a gap-control anchor.'),
      t('Below edge benchmarks', 'Under 76 composite', 'Block shedding and physicality insufficient for a featured interior edge role at this level.'),
    ]},
    'Pure Power': { tiers: [
      t('Power Moves 91+ / Strength 88+', 'Block Shedding 87+ / Hit Power 85+', 'Dominant interior power rusher who demands a double team on every passing down. Power moves at this tier are the most disruptive single trait in interior defensive line play.'),
      t('Power Moves 85+ / Strength 83+', 'Block Shedding 82+ / Hit Power 80+', 'Powerful interior rusher who creates push and occupies blockers. Projects as a featured pass rusher who forces extra attention from offensive coordinators.'),
      t('Power Moves 78+ / Strength 77+', 'Block Shedding 75+', 'Shows interior power potential but needs development in technique to be consistently disruptive against college linemen.'),
      t('Below pure power benchmarks', 'Under 76 composite', 'Power moves and strength not yet at standard for a featured interior power rusher. Development investment required.'),
    ]},
    'Gap Specialist': { tiers: [
      t('Block Shedding 91+ / Tackle 88+', 'Strength 87+ / Hit Power 84+', 'Elite gap disruptor who creates a new line of scrimmage on every snap. Block shedding and strength at this tier makes the interior run game nearly impossible to execute.'),
      t('Block Shedding 85+ / Tackle 83+', 'Strength 82+ / Hit Power 80+', 'Dependable interior disruptor who holds the line and finds the ball consistently. Projects as a starter who creates problems for run game concepts.'),
      t('Block Shedding 78+ / Tackle 75+', 'Strength 73+', 'Shows gap ability but lacks the elite instincts to be a dominant interior disruptor. Contributes as a rotational piece.'),
      t('Below gap benchmarks', 'Under 76 composite', 'Block shedding and strength not yet reliable enough to be a gap specialist at this level. Needs development in both dimensions.'),
    ]},
  },

  OLB: {
    archetypes: ['Thumper', 'Signal Caller', 'Lurker'],
    'Thumper': { tiers: [
      t('Tackle 91+ / Hit Power 89+', 'Strength 87+ / Play Recognition 83+', 'Elite physical linebacker who makes ball carriers pay on every contact. Hit power at this tier creates turnovers, forces fumbles, and sets a physical tone the entire defense feeds off.'),
      t('Tackle 85+ / Hit Power 83+', 'Strength 82+ / Play Recognition 79+', 'Physical backer who is a consistent tackler and a punishing presence. Projects as a starter who dominates run defense and limits YAC.'),
      t('Tackle 77+ / Hit Power 76+', 'Strength 74+', 'Physical but not elite enough to be a featured run stopper. Contributes in run-heavy packages with development.'),
      t('Below thumper benchmarks', 'Under 76 composite', 'Not yet physical enough to deliver on the thumper archetype. Hit power and tackle need significant development.'),
    ]},
    'Signal Caller': { tiers: [
      t('Play Recognition 91+ / Awareness 88+', 'Tackle 85+ / Pursuit 83+', 'Elite coverage linebacker who runs the defense and eliminates options in space. Football IQ at this tier is worth multiple scheme adjustments — he\'s worth more than his physical stats suggest.'),
      t('Play Recognition 85+ / Awareness 83+', 'Tackle 81+ / Pursuit 79+', 'Smart backer who reads plays quickly and is in the right position consistently. A reliable zone coverage option who handles blitz pickups and man assignments with development.'),
      t('Play Recognition 77+ / Awareness 75+', 'Tackle 73+', 'Above-average instincts who understands the scheme but lacks elite athleticism to execute every assignment. Functional in zone-heavy systems.'),
      t('Below signal caller benchmarks', 'Under 76 composite', 'Play recognition and coverage awareness not yet at the level to run a defense. Needs film study and reps to develop.'),
    ]},
    'Lurker': { tiers: [
      t('Zone Cov 91+ / Speed 88+', 'Play Recognition 86+ / Acceleration 85+', 'Elite coverage lurker who anticipates routes, breaks on the ball, and creates turnovers. Zone coverage and instincts at this tier produces the most interceptions from the linebacker position.'),
      t('Zone Cov 85+ / Speed 82+', 'Play Recognition 81+ / Acceleration 80+', 'Above-average zone linebacker who baits quarterbacks into risky throws. A playmaking coverage piece in any zone-heavy defensive scheme.'),
      t('Zone Cov 77+ / Speed 75+', 'Play Recognition 73+', 'Developing lurker with coverage instincts but lacks the athleticism to consistently make plays in space. Best in simplified zone concepts.'),
      t('Below lurker benchmarks', 'Under 76 composite', 'Coverage and instincts both underdeveloped for the lurker role. Needs scheme simplification and developmental reps.'),
    ]},
  },

  MIKE: {
    archetypes: ['Thumper', 'Signal Caller', 'Lurker'],
    'Thumper': { tiers: [
      t('Tackle 91+ / Hit Power 89+', 'Strength 87+ / Play Recognition 83+', 'Dominant physical MIKE who sets the tone for the entire defense. Hits, tackles, and leads by example — the kind of player defensive coordinators build the front seven around.'),
      t('Tackle 85+ / Hit Power 83+', 'Strength 82+ / Play Recognition 79+', 'Physical middle linebacker who anchors run defense and challenges ball carriers. A reliable starter who shows up in tackling stats every week.'),
      t('Tackle 77+ / Hit Power 76+', 'Strength 74+', 'Physical MIKE candidate who holds the position in the run game. Needs development in coverage and recognition to be a full-time three-down player.'),
      t('Below thumper benchmarks', 'Under 76 composite', 'Not yet physical enough to anchor the middle of a defense. Needs hitting power and tackle development.'),
    ]},
    'Signal Caller': { tiers: [
      t('Play Recognition 91+ / Awareness 88+', 'Tackle 86+ / Pursuit 84+', 'Elite defensive quarterback who anticipates every play before the snap. At this tier, he is the most valuable defensive player on the field — his ability to communicate turns 11 into one.'),
      t('Play Recognition 85+ / Awareness 83+', 'Tackle 81+ / Pursuit 80+', 'Smart MIKE who calls protections, adjusts to formation, and makes teammates better. Football IQ above average for any position — the quarterback of the defense.'),
      t('Play Recognition 77+ / Awareness 75+', 'Tackle 73+', 'Above-average recognition who is in the right place more often than not. Developing communicator but not yet elite enough to run the entire defense.'),
      t('Below signal caller benchmarks', 'Under 76 composite', 'Not yet equipped to run a defense from the MIKE position. Football IQ and coverage development needed before taking that responsibility.'),
    ]},
    'Lurker': { tiers: [
      t('Zone Cov 91+ / Speed 88+', 'Play Recognition 86+ / Acceleration 84+', 'Elite playmaking MIKE who turns zone coverage into an aggressive turnover machine. Speed and anticipation at this tier makes every zone concept exponentially more dangerous.'),
      t('Zone Cov 85+ / Speed 82+', 'Play Recognition 81+ / Acceleration 80+', 'Coverage-first MIKE who eliminates the intermediate field and creates disruption in zone looks. A chess piece for defensive coordinators.'),
      t('Zone Cov 77+ / Speed 75+', 'Play Recognition 73+', 'Developing coverage MIKE with instincts but needs athletic improvement to close on throws in time. Functional in simplified zone packages.'),
      t('Below lurker benchmarks', 'Under 76 composite', 'Coverage and speed both underdeveloped for a lurker MIKE. Needs athleticism and IQ development before the role functions.'),
    ]},
  },

  CB: {
    archetypes: ['Field', 'Bump and Run', 'Boundary', 'Zone'],
    'Field': { tiers: [
      t('Man Cov 90+ / Zone Cov 88+', 'Speed 87+ / Acceleration 85+', 'Elite field corner who shuts down any receiver on any route combination. Coverage at this tier eliminates the offensive player — defenses can play anything with him on the field.'),
      t('Man Cov 84+ / Zone Cov 82+', 'Speed 83+ / Acceleration 81+', 'Above-average cover corner who is reliable in man and has the athleticism to recover from mistakes. Projects as a starter who limits explosive plays.'),
      t('Man Cov 77+ / Zone Cov 75+', 'Speed 76+', 'Functional field corner who shows enough athleticism and coverage to contribute in limited packages. Needs refinement against elite receivers.'),
      t('Below field benchmarks', 'Under 76 composite', 'Man coverage and athleticism insufficient to play the field side at a high level. Needs significant development in both dimensions.'),
    ]},
    'Bump and Run': { tiers: [
      t('Press 91+ / Man Cov 88+', 'Speed 87+ / Acceleration 84+', 'Elite press corner who disrupts every route at the line. Press coverage at this tier eliminates the timing of the entire passing game — the most impactful one-on-one defender in football.'),
      t('Press 85+ / Man Cov 83+', 'Speed 82+ / Acceleration 80+', 'Above-average press corner who jams receivers, disrupts timing, and wins physical matchups at the line. A featured element in press-man defensive packages.'),
      t('Press 77+ / Man Cov 76+', 'Speed 75+', 'Shows press ability but not yet consistent enough to hold at the line against elite releases. Contributes in specific press packages with development.'),
      t('Below press benchmarks', 'Under 76 composite', 'Not yet physical or quick enough to execute press coverage at this level. Needs technique and strength development.'),
    ]},
    'Boundary': { tiers: [
      t('Man Cov 90+ / Press 87+', 'Speed 85+ / Acceleration 83+', 'Complete boundary corner who handles the run, press, and man coverage equally well. The most reliable corner on the roster — trusted in any down-and-distance situation.'),
      t('Man Cov 84+ / Press 82+', 'Speed 80+ / Acceleration 79+', 'Tough, reliable boundary corner who handles run support and coverage both. A valuable piece who does the dirty work in one of the most demanding spots on defense.'),
      t('Man Cov 76+ / Press 74+', 'Speed 73+', 'Developing boundary corner with physical tools. Can handle run-support duties while coverage technique catches up.'),
      t('Below boundary benchmarks', 'Under 76 composite', 'Neither coverage nor physical dimensions developed enough for the boundary role demands. Needs across-the-board improvement.'),
    ]},
    'Zone': { tiers: [
      t('Zone Cov 91+ / Speed 87+', 'Acceleration 85+ / Awareness 84+', 'Elite zone corner with elite anticipation and positioning. Ball hawking ability at this tier creates interceptions from zone looks that other corners could never reach.'),
      t('Zone Cov 85+ / Speed 82+', 'Acceleration 82+ / Awareness 81+', 'Above-average zone corner who reads quarterbacks and breaks on the ball effectively. A reliable piece in cover-2 and cover-3 concepts.'),
      t('Zone Cov 77+ / Speed 76+', 'Acceleration 74+ / Awareness 73+', 'Functional zone corner with decent positioning. Lacks the elite instincts to bait QBs but can hold his zone assignment reliably.'),
      t('Below zone benchmarks', 'Under 76 composite', 'Zone coverage instincts and play recognition not yet at a standard for a featured zone corner at this level.'),
    ]},
  },

  FS: {
    archetypes: ['Coverage Specialist', 'Hybrid', 'Box Specialist'],
    'Coverage Specialist': { tiers: [
      t('Zone Cov 91+ / Speed 88+', 'Acceleration 87+ / Awareness 85+', 'Elite centerfield safety who takes away the entire deep half. Zone coverage and range at this tier forces offenses to eliminate the deep ball from their game plan — a cheat code for any defense.'),
      t('Zone Cov 85+ / Speed 83+', 'Acceleration 82+ / Awareness 80+', 'Above-average free safety with reliable coverage instincts and solid range. Projects as a starting-caliber centerfield player in most defensive schemes.'),
      t('Zone Cov 77+ / Speed 76+', 'Acceleration 74+', 'Functional zone safety who covers his assignment. Lacks the range or anticipation to make plays outside his area consistently.'),
      t('Below zone benchmarks', 'Under 76 composite', 'Zone coverage and range insufficient to protect the deep half effectively. Needs significant development before being trusted as a lone high safety.'),
    ]},
    'Hybrid': { tiers: [
      t('Zone Cov 89+ / Speed 87+', 'Tackle 85+ / Acceleration 84+', 'Elite hybrid safety who can do everything. Zone range, man coverage, and run support — a defensive coordinator\'s dream who can be deployed in any scheme.'),
      t('Zone Cov 83+ / Speed 81+', 'Tackle 81+ / Acceleration 80+', 'Versatile safety with above-average tools in multiple phases. Can rotate from deep to box, play man or zone, and contributes as a nickel defender in certain packages.'),
      t('Zone Cov 76+ / Speed 74+', 'Tackle 73+', 'Hybrid ability shown but not dominant in either dimension yet. Best in simplified defensive packages where the versatility doesn\'t require elite execution.'),
      t('Below hybrid benchmarks', 'Under 76 composite', 'Not yet developed enough in either coverage dimension to justify the hybrid designation at this level.'),
    ]},
    'Box Specialist': { tiers: [
      t('Tackle 90+ / Speed 84+', 'Awareness 85+ / Acceleration 84+', 'Elite box-deployed free safety who dominates in run support while maintaining the athleticism to cover his deep responsibility. Forces offensive coordinators to account for him near the line.'),
      t('Tackle 84+ / Speed 80+', 'Awareness 80+', 'Reliable box safety from the FS spot who contributes significantly in run defense. Valuable in 8-man boxes and blitz packages.'),
      t('Tackle 77+ / Speed 76+', 'Awareness 74+', 'Functional box specialist who handles run support but lacks the athleticism to be a true multi-purpose threat. Best in rotation.'),
      t('Below box benchmarks', 'Under 76 composite', 'Not yet physical or aware enough to be a reliable box safety from the FS position at this level.'),
    ]},
  },

  SS: {
    archetypes: ['Coverage Specialist', 'Box Specialist', 'Hybrid'],
    'Coverage Specialist': { tiers: [
      t('Zone Cov 91+ / Speed 88+', 'Acceleration 86+ / Awareness 84+', 'Elite coverage strong safety who eliminates tight ends and slots. A luxury for any defense — adds a true coverage dimension to the back end.'),
      t('Zone Cov 85+ / Speed 83+', 'Acceleration 82+ / Awareness 80+', 'Above-average coverage SS who can handle man assignments in specific packages. Provides a safety valve against TE and slot mismatches.'),
      t('Zone Cov 76+ / Speed 74+', 'Acceleration 73+', 'Developing coverage safety who contributes in zone-heavy packages. Coverage limitations may require schematic protection.'),
      t('Below coverage benchmarks', 'Under 76 composite', 'Coverage ability not yet sufficient for a featured coverage strong safety role at this level.'),
    ]},
    'Box Specialist': { tiers: [
      t('Tackle 92+ / Speed 87+', 'Acceleration 86+ / Awareness 84+', 'Elite physical enforcer who dominates the box and punishes every receiver who crosses the middle. Tackle at this tier creates turnovers, forces fumbles, and changes offensive play-calling.'),
      t('Tackle 86+ / Speed 82+', 'Awareness 81+ / Acceleration 81+', 'Dominant run-stopping safety who is the most physical player in the secondary. Creates a different calculation for offensive coordinators running the ball or targeting the seam.'),
      t('Tackle 78+ / Speed 76+', 'Awareness 73+', 'Physical SS who contributes in run support and short areas. Not yet dominant enough at the line to consistently alter offensive game-planning.'),
      t('Below box benchmarks', 'Under 76 composite', 'Tackle and athleticism not yet at the level for a dominant box safety. Needs development before the archetype delivers on its promise.'),
    ]},
    'Hybrid': { tiers: [
      t('Zone Cov 89+ / Speed 87+', 'Tackle 85+ / Acceleration 84+', 'Complete strong safety equally dangerous in coverage and the box. Elite hybrid SS is a scheme-bending prospect who demands unique defensive attention.'),
      t('Zone Cov 83+ / Speed 81+', 'Tackle 81+ / Acceleration 80+', 'Dependable hybrid who handles both phases adequately. Can play as a traditional box safety or rotate into coverage without being a liability.'),
      t('Zone Cov 76+ / Speed 74+', 'Tackle 73+', 'Shows both dimensions but lacks dominance in either. Functional hybrid with development needed to become a featured piece.'),
      t('Below hybrid benchmarks', 'Under 76 composite', 'Physical and coverage development both insufficient to deliver on the hybrid archetype at this level.'),
    ]},
  },

  ATH: {
    archetypes: ['Dual Threat', 'Pure Runner', 'East/West Playmaker', 'Backfield Threat', 'Contested Specialist', 'Physical Route Runner', 'Power Rusher', 'Thumper', 'Lurker', 'Pure Possession', 'Agile', 'Contact Seeker'],
    'Dual Threat': { tiers: [
      t('Speed 90+ / Throw On Run 87+', 'Acceleration 86+ / Throw Power 85+', 'Elite multi-threat playmaker who can beat you passing or running. Defending both simultaneously is nearly impossible — a generational offensive weapon who forces unique schematic responses.'),
      t('Speed 84+ / Throw On Run 82+', 'Acceleration 81+ / Throw Power 80+', 'Legitimate dual-threat weapon with defined ability in both areas. Keeps defenses honest and creates RPO and packaged play advantages.'),
      t('Speed 78+ / Throw On Run 75+', 'Acceleration 73+', 'Shows dual-threat traits but neither dimension is elite enough to force defensive adjustments consistently. Best in systems with specific dual-threat packages.'),
      t('Below dual benchmarks', 'Under 76 composite', 'Neither passing nor running dimension developed enough to create a true dual-threat problem at this level.'),
    ]},
    'Pure Runner': { tiers: [
      t('Speed 93+ / Acceleration 91+', 'Throw On Run 85+', 'Elite rushing athlete who cannot be accounted for schematically. At this tier, the position is almost irrelevant — this prospect is a cheat code with the ball in their hands.'),
      t('Speed 87+ / Acceleration 85+', 'Throw On Run 80+', 'Explosive running athlete with elite top-end speed. Dangerous in any designed run concept or packaged play that gets them in space.'),
      t('Speed 80+ / Acceleration 77+', 'Throw On Run 73+', 'Above-average speed athlete in a running role. Not elite enough to be a standalone weapon but contributes in designed run concepts.'),
      t('Below runner benchmarks', 'Under 76 composite', 'Speed and burst not yet elite enough to justify Pure Runner deployment at this level.'),
    ]},
    'East/West Playmaker': { tiers: [
      t('Speed 90+ / Acceleration 88+', 'CoD 87+ / Juke Move 85+', 'Elite lateral playmaker who thrives in space. Speed and change of direction at this tier is a nightmare for linebackers and safeties — best in motion, screen, and space concepts.'),
      t('Speed 84+ / Acceleration 83+', 'CoD 82+ / Juke Move 80+', 'Above-average east/west weapon who creates yards after contact in the open field. Versatile enough to line up in multiple spots and create problems.'),
      t('Speed 77+ / Acceleration 76+', 'CoD 74+', 'Solid athlete with lateral quickness. Contributes in specific packages but needs more development in one area to be a featured east/west weapon.'),
      t('Below EW benchmarks', 'Under 76 composite', 'Lateral athleticism not yet elite enough for the east/west playmaker designation at this level.'),
    ]},
    'Backfield Threat': { tiers: [
      t('Catching 90+ / Speed 88+', 'Acceleration 85+ / CoD 84+', 'Elite backfield weapon with every tool — vision, speed, hands, and physicality. Projects as a featured back wherever the program deploys him.'),
      t('Catching 84+ / Speed 83+', 'Acceleration 81+ / CoD 80+', 'Versatile backfield contributor who can carry, receive, and block. Above-average in multiple areas makes him a chess piece in the offensive scheme.'),
      t('Catching 77+ / Speed 75+', 'Acceleration 73+', 'Serviceable backfield threat who contributes in defined roles. Lacks a standout trait to be a featured backfield weapon.'),
      t('Below backfield benchmarks', 'Under 76 composite', 'Not yet developed enough in any backfield dimension to be featured in that role at this level.'),
    ]},
    'Contested Specialist': { tiers: [
      t('Spectacular Catch 91+ / CiT 88+', 'Catching 87+ / Deep Route 84+', 'Elite jump-ball athlete who wins 50/50 balls at an elite rate regardless of where they line up. A red zone and go-route specialist that changes offensive ceilings.'),
      t('Spectacular Catch 85+ / CiT 82+', 'Catching 82+ / Deep Route 79+', 'Above-average contested catcher who makes plays in crowded areas. Creates in red zone and deep ball situations wherever deployed.'),
      t('Spectacular Catch 78+ / CiT 76+', 'Catching 74+', 'Shows some contested ability but not reliably dominant enough to be a go-to target in tight windows.'),
      t('Below contested benchmarks', 'Under 76 composite', 'Contested catch ability not yet sufficient to be featured in that role at this level.'),
    ]},
    'Physical Route Runner': { tiers: [
      t('Speed 90+ / Med Route 87+', 'CiT 85+ / Catching 84+', 'Physical receiving ATH who wins in traffic with precise routes. A mismatch wherever lined up — linebackers can\'t cover the routes, DBs can\'t handle the physicality.'),
      t('Speed 84+ / Med Route 82+', 'CiT 81+ / Catching 80+', 'Above-average physical receiver who is reliable in traffic and tough assignments. Projects as a starter in the receiving game.'),
      t('Speed 77+ / Med Route 74+', 'CiT 73+', 'Shows physicality in routes but inconsistent in execution. Contributing in specific packages while developing full route tree.'),
      t('Below physical route benchmarks', 'Under 76 composite', 'Neither physicality nor route precision developed enough for a featured role at this level.'),
    ]},
    'Power Rusher': { tiers: [
      t('Power Moves 91+ / Strength 88+', 'Block Shedding 86+ / Hit Power 84+', 'Dominant power rusher from the ATH designation — elite pass rush production from anywhere on the defensive front. Physical dominance at this tier makes him a priority defensive recruit.'),
      t('Power Moves 85+ / Strength 83+', 'Block Shedding 82+ / Hit Power 80+', 'Above-average power rusher who disrupts run and pass games. Above-average physical tools give him a defined role on any defensive front.'),
      t('Power Moves 78+ / Strength 76+', 'Block Shedding 74+', 'Shows power rush potential but needs development to be consistent. Contributes in rotation while adding strength and technique.'),
      t('Below power rusher benchmarks', 'Under 76 composite', 'Power rush tools underdeveloped for a featured pass rush role from the ATH position at this level.'),
    ]},
    'Thumper': { tiers: [
      t('Tackle 91+ / Hit Power 89+', 'Strength 87+ / Play Recognition 83+', 'Elite physical ATH deployed in a linebacker or safety role. Tackle and hit power at this tier changes the physical culture of a defense.'),
      t('Tackle 85+ / Hit Power 83+', 'Strength 82+ / Play Recognition 79+', 'Physical ATH who contributes immediately in run-support or coverage roles. Physical tools project to a starting role with proper development.'),
      t('Tackle 77+ / Hit Power 76+', 'Strength 73+', 'Physical with upside but not yet dominant enough to be a featured thumper at this level. Needs strength and technique development.'),
      t('Below thumper benchmarks', 'Under 76 composite', 'Physical dimensions insufficient to justify the thumper deployment from the ATH position.'),
    ]},
    'Lurker': { tiers: [
      t('Zone Cov 90+ / Speed 88+', 'Play Recognition 86+ / Acceleration 84+', 'Elite coverage lurker from the ATH position. Zone instincts and speed at this tier is a turnover machine in any zone defensive concept.'),
      t('Zone Cov 84+ / Speed 82+', 'Play Recognition 81+ / Acceleration 80+', 'Above-average lurker who creates opportunities in zone coverage. A versatile coverage piece that adds dimension to any secondary.'),
      t('Zone Cov 76+ / Speed 74+', 'Play Recognition 73+', 'Shows lurker instincts but needs development in coverage technique and quickness to be a featured element.'),
      t('Below lurker benchmarks', 'Under 76 composite', 'Coverage instincts and athleticism both insufficient for a featured lurker role from the ATH position.'),
    ]},
    'Pure Possession': { tiers: [
      t('Catching 89+ / CiT 87+', 'Short Route 85+ / Med Route 83+', 'Elite possession weapon who catches everything in traffic. Reliable in any receiving concept — the kind of ATH who becomes the quarterback\'s best friend on third down.'),
      t('Catching 83+ / CiT 82+', 'Short Route 80+ / Med Route 79+', 'Dependable receiving ATH who converts tough catches. Projects as a starting receiving contributor in whatever role the program assigns.'),
      t('Catching 76+ / CiT 74+', 'Short Route 73+', 'Serviceable possession receiver in limited packages. Needs development in route running to become a featured pass-catching option.'),
      t('Below possession benchmarks', 'Under 76 composite', 'Hands and traffic awareness not yet at the level for a featured possession role at this level.'),
    ]},
    'Agile': { tiers: [
      t('Agility 90+ / Acceleration 88+', 'Speed 86+ / Awareness 84+', 'Elite movement athlete who creates problems in any scheme. Agility and coordination at this tier makes them a weapon as a blocker, runner, or receiver in space concepts.'),
      t('Agility 84+ / Acceleration 83+', 'Speed 81+ / Awareness 79+', 'Above-average movement athlete who executes agile blocking and receiving concepts cleanly. Versatile contributor who improves any unit they play in.'),
      t('Agility 77+ / Acceleration 75+', 'Speed 73+', 'Above-average athleticism for the ATH position. Shows agile tools but needs more polish to be featured in space.'),
      t('Below agile benchmarks', 'Under 76 composite', 'Agility and movement skills insufficient to be a featured agile ATH weapon at this level.'),
    ]},
    'Contact Seeker': { tiers: [
      t('Break Tackle 91+ / Carrying 89+', 'BC Vision 85+ / Awareness 83+', 'Physically dominant ATH who thrives on contact. Break tackle and physicality at this tier makes every carry a potential broken-tackle highlight.'),
      t('Break Tackle 85+ / Carrying 83+', 'BC Vision 79+', 'Physical ATH who runs through defenders and falls forward. Valuable in power run concepts wherever deployed.'),
      t('Break Tackle 77+ / Carrying 76+', 'BC Vision 72+', 'Physical but not yet dominant enough to be a true contact-seeking weapon. Short-yardage and tough-run contributor.'),
      t('Below contact benchmarks', 'Under 76 composite', 'Break tackle and physicality not yet sufficient for the contact seeker role from the ATH position.'),
    ]},
  },
};

export const POSITIONS = ['QB','HB','WR','TE','OT','OG','C','DE','DT','OLB','MIKE','CB','FS','SS','ATH'];
export { PROFILES };

export default function ThresholdLookup({ players = [], teamColors, teamLogo, onGoToDatabase }) {
  const p = teamColors?.primary || '#374151';
  const [activePos, setActivePos] = useState('QB');
  const [activeArch, setActiveArch] = useState('Pocket Passer');
  const [activeTierIdx, setActiveTierIdx] = useState(null);
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

  const profile = PROFILES[activePos];

  // Reset archetype when position changes
  const handlePosChange = pos => {
    setActivePos(pos);
    setActiveArch(PROFILES[pos].archetypes[0]);
    setActiveTierIdx(null);
  };

  const tierData = profile[activeArch]?.tiers ?? [];

  // Compute archetype-weighted scores for players matching active position/archetype
  const TIER_SCORE_RANGES = [
    { min: 88, max: Infinity },
    { min: 82, max: 87.99 },
    { min: 76, max: 81.99 },
    { min: 0,  max: 75.99 },
  ];

  const tierPlayerNames = useMemo(() => {
    if (!players.length) return [[], [], [], []];
    const matching = players.filter(pl => {
      if (pl.position !== activePos) return false;
      const arch = normalizeArch(pl.archetype ?? pl.arch ?? '');
      return arch === activeArch || arch === normalizeArch(activeArch);
    });
    const scored = matching.map(pl => ({ name: pl.name, score: computeScore(pl) }));
    return TIER_SCORE_RANGES.map(({ min, max }) =>
      scored.filter(p => p.score >= min && p.score <= max)
            .sort((a, b) => b.score - a.score)
            .map(p => `${p.name} (${p.score.toFixed(0)})`)
    );
  }, [players, activePos, activeArch]);

  // Compute min / avg / max per attribute for each tier
  const tierAttrStats = useMemo(() => {
    const arch    = normalizeArch(activeArch);
    const weights = ARCHETYPE_WEIGHTS[`${activePos}_${arch}`] ?? {};
    // Use the scouting form's attribute list — this is exactly what's stored in player.attributes
    const formAttrs = getFormAttrs(activePos, arch);

    const matching = players.filter(pl => {
      if (pl.position !== activePos) return false;
      return normalizeArch(pl.archetype ?? '') === arch;
    }).map(pl => ({ ...pl, _score: computeScore(pl) }));

    return TIER_SCORE_RANGES.map(({ min, max }) => {
      const group = matching.filter(p => p._score >= min && p._score <= max);
      const stats = {};
      formAttrs.forEach(attr => {
        const vals = group.map(p => p.attributes?.[attr]).filter(v => typeof v === 'number' && v > 0);
        stats[attr] = vals.length
          ? { min: Math.min(...vals), avg: vals.reduce((a, b) => a + b, 0) / vals.length, max: Math.max(...vals) }
          : null;
      });
      return { count: group.length, attrs: formAttrs, weights, stats };
    });
  }, [players, activePos, activeArch]);

  const quote = (() => {
    if (!players.length) return "No class data to benchmark yet — get me some prospects and I'll run the tier analysis.";
    const avgs = players.map(pl => { const vals = Object.values(pl.attributes).filter(v => typeof v === 'number'); return vals.length ? vals.reduce((a,b) => a+b,0)/vals.length : 0; });
    const classAvg = avgs.reduce((a,b) => a+b,0) / avgs.length;
    if (classAvg >= 85) return `Class averaging ${classAvg.toFixed(1)} on raw attributes — squarely Tier 1 range.`;
    if (classAvg >= 78) return `Averaging ${classAvg.toFixed(1)} — Tier 2-3 range. Solid foundation, room to push higher.`;
    if (classAvg >= 70) return `Class sits at ${classAvg.toFixed(1)} — Tier 3 territory. Need more premium targets.`;
    return `Averaging ${classAvg.toFixed(1)} — most of this class is Tier 4. Need significantly higher-caliber prospects.`;
  })();

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Header strip */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: '#080c14', border: `1px solid ${p}22` }}>
        {onGoToDatabase && (
          <button onClick={onGoToDatabase} className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md transition hover:opacity-80" style={{ background: `${p}18`, color: `${p}cc`, border: `1px solid ${p}30` }}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5"><polyline points="15 18 9 12 15 6"/></svg>
            Player Database
          </button>
        )}
        {teamLogo && <img src={teamLogo} alt="" className="w-6 h-6 object-contain flex-shrink-0" style={{ opacity: 0.7 }} />}
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
          <p style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(1.4rem, 3vw, 2rem)', color: 'white', letterSpacing: '0.06em', lineHeight: 1 }}>THRESHOLD BENCHMARKS</p>
          <p className="text-[9px] text-slate-500 leading-snug">With the current data compiled, these are the thresholds to target at each tier. Benchmarks adjust as more players are added to the board.</p>
          <p className="text-[10px] text-slate-400 italic leading-snug mt-auto">{quote}</p>
        </div>
      </div>

      {/* Main Panel — position nav left, archetype + tiers right */}
      <div className="rounded-xl overflow-hidden flex flex-col md:flex-row min-h-[520px]" style={{ background: '#080c14', border: `1px solid ${p}22` }}>

        {/* Position Nav */}
        <div className="w-full md:w-28 bg-slate-950/40 border-b md:border-b-0 md:border-r border-slate-800 p-2 flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-x-visible scrollbar-none shrink-0">
          {POSITIONS.map(pos => (
            <button
              key={pos}
              onClick={() => handlePosChange(pos)}
              className={`text-[10px] font-black uppercase tracking-wider px-2 py-2 rounded-lg transition shrink-0 text-center ${
                activePos === pos
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {pos}
            </button>
          ))}
        </div>

        {/* Right panel */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Archetype tabs */}
          <div className="border-b border-slate-800 px-4 py-2 flex flex-wrap gap-1.5">
            {profile.archetypes.map(arch => (
              <button
                key={arch}
                onClick={() => { setActiveArch(arch); setActiveTierIdx(null); }}
                className={`text-[10px] font-bold px-2.5 py-1 rounded-md transition uppercase tracking-wide ${
                  activeArch === arch
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {arch}
              </button>
            ))}
          </div>

          {/* Position + archetype label */}
          <div className="px-5 py-3 border-b border-slate-800/50">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">
              {activePos} · {activeArch}
            </p>
          </div>

          {/* 4 Tier Cards */}
          <div className="p-4 space-y-3 flex-1">
            {TIER_STYLES.map((style, i) => {
              const tier = tierData[i];
              if (!tier) return null;
              const names = tierPlayerNames[i] ?? [];
              const isOpen = activeTierIdx === i;
              const attrData = tierAttrStats[i];
              return (
                <div
                  key={i}
                  onClick={() => setActiveTierIdx(isOpen ? null : i)}
                  className={`rounded-xl border cursor-pointer transition-opacity hover:opacity-90 ${style.border} ${style.bg}`}
                >
                  <div className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className={`text-[11px] font-black uppercase tracking-wide ${style.heading}`}>{style.label}</h4>
                          <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${style.pill}`}>{style.score}</span>
                          <span className={`ml-auto text-[8px] font-black uppercase px-2 py-0.5 rounded border ${
                            isOpen ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-950/60 border-slate-700 text-slate-500'
                          }`}>
                            {isOpen ? 'Hide' : 'Stats'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300 leading-relaxed">{tier.cond}</p>
                        {names.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {names.map((n, ni) => (
                              <span key={ni} className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${style.pill} opacity-80`}>{n}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex sm:flex-col gap-1.5 shrink-0">
                        <div className="bg-slate-950/80 border border-slate-800 px-2.5 py-1 rounded-lg text-[9px] font-mono text-slate-300 whitespace-nowrap">
                          <span className="text-slate-600 uppercase mr-1">Key:</span>{tier.k1}
                        </div>
                        <div className="bg-slate-950/80 border border-slate-800 px-2.5 py-1 rounded-lg text-[9px] font-mono text-slate-500 whitespace-nowrap">
                          <span className="text-slate-600 uppercase mr-1">Alt:</span>{tier.k2}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Attribute stats — toggled by clicking the card */}
                  {isOpen && <div className="border-t border-slate-800/60 px-4 pb-4 pt-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">
                      {attrData.count > 0
                        ? <>Attribute Breakdown · {attrData.count} prospect{attrData.count !== 1 ? 's' : ''}</>
                        : <>Attribute Benchmarks · No data yet</>
                      }
                      <span className="ml-2 normal-case font-normal text-slate-700">
                        (<span className="text-red-500/70">min</span> · <span className="text-slate-400">avg</span> · <span className="text-emerald-400/70">max</span>)
                      </span>
                    </p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                      {[attrData.attrs.slice(0, 5), attrData.attrs.slice(5)].map((col, ci) => (
                        <div key={ci} className="space-y-1">
                          {col.map(attr => {
                            const stat = attrData.stats[attr];
                            const w = attrData.weights[attr];
                            const label = ATTR_SHORT[attr] || attr;
                            return (
                              <div key={attr} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg ${w > 0 ? 'bg-slate-950/70' : 'bg-slate-950/20 opacity-40'}`}>
                                <span className="text-[9px] font-bold text-slate-300 w-16 shrink-0 truncate">{label}</span>
                                <span className={`text-[7px] font-black w-6 shrink-0 ${w > 0 ? 'text-slate-500' : 'text-slate-700'}`}>
                                  {w > 0 ? `${Math.round(w * 100)}%` : '—'}
                                </span>
                                {stat ? (
                                  <div className="flex items-center gap-0.5 text-[8px] font-mono">
                                    <span className="text-red-400/80">{stat.min}</span>
                                    <span className="text-slate-700 mx-0.5">/</span>
                                    <span className="text-slate-200 font-bold">{stat.avg.toFixed(0)}</span>
                                    <span className="text-slate-700 mx-0.5">/</span>
                                    <span className="text-emerald-400/80">{stat.max}</span>
                                  </div>
                                ) : (
                                  <span className="text-[8px] text-slate-600 font-mono">— / — / —</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
