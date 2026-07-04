import React, { useState, useEffect, useMemo } from 'react';
import { createStaffAccessor } from './staffDB';
import { normalizeArch } from './archetypeWeights';
import {
  DEV_TRAITS, getFormAttrs, buildRevealedPool, getAllTierProfiles,
} from '../utils/devTraitLearning';
import { computeAttributeQuality } from '../utils/devPrediction';
import { useToast } from './ui/Toast';

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
// Each tier now maps 1:1 to a literal revealed devTrait value (DEV_TRAITS order),
// not a computeScore band — see devTraitLearning.js.
// Tier heading colors match the dev trait badge colors used in the
// Recruiting Database exactly (Elite/Star/Impact/Normal).
// Border/glow match the dev trait badges in the Recruiting Database exactly
// (PlayerDatabase.jsx's Current Roster dev trait pills), not just the heading text.
const TIER_STYLES = [
  { label: 'Tier 1: Elite',  devTrait: 'Elite',  border: 'border-[#0E7A2A]', heading: 'text-[#22E065]', bg: 'bg-surface-3', glow: 'shadow-[0_0_16px_rgba(14,122,42,0.85)]' },
  { label: 'Tier 2: Star',   devTrait: 'Star',   border: 'border-[#9C7209]', heading: 'text-[#FFD100]', bg: 'bg-surface-3', glow: 'shadow-[0_0_14px_rgba(156,114,9,0.8)]' },
  { label: 'Tier 3: Impact', devTrait: 'Impact', border: 'border-[#7C8991]', heading: 'text-[#D6DEE2]', bg: 'bg-surface-3', glow: '' },
  { label: 'Tier 4: Normal', devTrait: 'Normal', border: 'border-[#8C5524]', heading: 'text-[#CD7F32]', bg: 'bg-surface-3', glow: '' },
];

const STAR_TABS = ['5', '4', '3', '2', '1'];

// t(key1, key2, condition) shorthand
const t = (k1, k2, cond) => ({ k1, k2, cond });

// ── Archetype-level threshold profiles ───────────────────────────────────────
const PROFILES = {
  QB: {
    archetypes: ['Pocket Passer', 'Dual Threat', 'Backfield Creator', 'Pure Runner'],
    'Pocket Passer': { tiers: [
      t('THR PWR 90+ / SHORT ACC 88+', 'MED ACC 87+ / UNDR PRES 85+', 'Pocket savant with elite accuracy, power, and IQ; dominates the clean pocket and develops at an absurd rate into a Heisman-caliber leader.'),
      t('THR PWR 84+ / SHORT ACC 82+', 'MED ACC 81+ / UNDR PRES 79+', 'Highly accurate pocket general with a strong arm; develops quickly into a reliable superstar.'),
      t('THR PWR 76+ / SHORT ACC 75+', 'MED ACC 74+ / UNDR PRES 73+', 'Solid accuracy and pocket presence; a good starter who develops well.'),
      t('Below accuracy benchmarks', 'Under 76 composite', 'Basic pocket passer with average arm and accuracy; develops slowly.'),
    ]},
    'Dual Threat': { tiers: [
      t('SPD 90+ / THR/RUN 87+', 'ACC 86+ / THR PWR 85+', 'Deadly dual-threat with both arm and legs; elite mobility and accuracy fuel explosive development into a true game-changer.'),
      t('SPD 84+ / THR/RUN 82+', 'ACC 81+ / THR PWR 80+', 'Strong passer-runner hybrid; develops quickly into a dynamic playmaker.'),
      t('SPD 77+ / THR/RUN 75+', 'ACC 74+ / THR PWR 73+', 'Balanced runner-passer; develops into a reliable dual option.'),
      t('Below dual benchmarks', 'Under 76 composite', 'Decent mobility and arm; grows slowly into an average starter.'),
    ]},
    'Backfield Creator': { tiers: [
      t('THR/RUN 90+ / SHORT ACC 87+', 'BRK SACK 86+ / THR PWR 85+', 'Backfield magician who extends plays; elite off-platform throws drive rapid superstar growth.'),
      t('THR/RUN 84+ / SHORT ACC 81+', 'BRK SACK 80+ / THR PWR 79+', 'Creative scrambler with accurate on-the-move throws; strong development.'),
      t('THR/RUN 77+ / SHORT ACC 75+', 'BRK SACK 73+', 'Good at creating time and throwing under pressure; a solid contributor.'),
      t('Below creator benchmarks', 'Under 76 composite', 'Functional play-extender; slow development.'),
    ]},
    'Pure Runner': { tiers: [
      t('SPD 93+ / ACC 91+', 'THR/RUN 86+', 'Speed demon runner with option mastery; elite elusiveness develops into a Lamar-like threat.'),
      t('SPD 87+ / ACC 85+', 'THR/RUN 81+', 'Explosive rusher with a decent arm; develops fast as a run-first weapon.'),
      t('SPD 80+ / ACC 78+', 'THR/RUN 73+', 'Strong runner with limited passing; a good developmental piece.'),
      t('Below running benchmarks', 'Under 76 composite', 'Basic mobile QB; slow growth as a situational runner.'),
    ]},
  },

  HB: {
    archetypes: ['Elusive Bruiser', 'East/West Playmaker', 'Contact Seeker', 'Backfield Threat', 'North/South Receiver', 'North/South Blocker'],
    'Elusive Bruiser': { tiers: [
      t('BRK TKL 91+ / JUKE 88+', 'SPD 87+ / ACC 85+', 'Complete back with vision, power, and elusiveness; develops at an absurd rate into a feature NFL talent.'),
      t('BRK TKL 85+ / JUKE 83+', 'SPD 82+ / ACC 81+', 'Versatile runner who breaks tackles and makes people miss; a quick riser.'),
      t('BRK TKL 77+ / JUKE 76+', 'SPD 76+', 'Balanced every-down back; develops into a solid starter.'),
      t('Below elusive benchmarks', 'Under 76 composite', 'Average hybrid; slow development.'),
    ]},
    'East/West Playmaker': { tiers: [
      t('SPD 90+ / ACC 88+', 'COD 87+ / JUKE 86+', 'Lateral, explosive big-play machine; elite speed and change of direction develop into a game-breaker.'),
      t('SPD 84+ / ACC 82+', 'COD 81+ / JUKE 80+', 'Shifty speedster who bounces outside; strong development.'),
      t('SPD 77+ / ACC 76+', 'COD 74+', 'Good cutback vision; a reliable playmaker.'),
      t('Below east/west benchmarks', 'Under 76 composite', 'Average lateral runner; slow growth.'),
    ]},
    'Contact Seeker': { tiers: [
      t('BRK TKL 91+ / CAR 89+', 'BC VIS 84+ / AWR 82+', 'Physical downhill beast who trucks defenders; elite power drives rapid development.'),
      t('BRK TKL 85+ / CAR 83+', 'BC VIS 79+', 'Tough between-the-tackles runner; grows fast into a bell-cow back.'),
      t('BRK TKL 77+ / CAR 76+', 'BC VIS 72+', 'Solid power back; a good short-yardage option.'),
      t('Below contact benchmarks', 'Under 76 composite', 'Basic bruiser; slow developer.'),
    ]},
    'Backfield Threat': { tiers: [
      t('CTH 90+ / SPD 87+', 'ACC 86+ / COD 84+', 'Receiving weapon out of the backfield with real rushing ability; elite hands and routes drive superstar growth.'),
      t('CTH 84+ / SPD 82+', 'ACC 81+ / COD 80+', 'Dynamic pass-catching back; develops quickly.'),
      t('CTH 76+ / SPD 75+', 'ACC 73+', 'Good receiver-runner; a solid contributor.'),
      t('Below backfield threat benchmarks', 'Under 76 composite', 'Average pass-catching back; slow growth.'),
    ]},
    'North/South Receiver': { tiers: [
      t('SPD 89+ / CTH 87+', 'BC VIS 84+ / ACC 83+', 'Speedy straight-line runner with receiving skills; elite burst develops into a deep threat.'),
      t('SPD 83+ / CTH 81+', 'BC VIS 79+ / ACC 80+', 'Fast north-south back who catches well; a strong riser.'),
      t('SPD 77+ / CTH 74+', 'BC VIS 73+', 'Decent speed and hands; reliable.'),
      t('Below receiver benchmarks', 'Under 76 composite', 'Basic runner-receiver; slow development.'),
    ]},
    'North/South Blocker': { tiers: [
      t('CAR 89+ / BRK TKL 87+', 'AWR 85+ / BC VIS 84+', 'Power lead blocker with short-yardage punch; elite toughness develops into an anchor.'),
      t('CAR 83+ / BRK TKL 81+', 'AWR 81+ / BC VIS 80+', 'Strong run supporter; good development.'),
      t('CAR 76+ / BRK TKL 74+', 'AWR 73+', 'Solid blocker-runner; a rotational piece.'),
      t('Below blocker benchmarks', 'Under 76 composite', 'Average blocker; slow growth.'),
    ]},
  },

  WR: {
    archetypes: ['Speedster', 'Route Artist', 'Elusive Route Runner', 'Physical Route Runner', 'Gritty Possession', 'Contested Specialist', 'Gadget'],
    'Speedster': { tiers: [
      t('SPD 93+ / ACC 91+', 'DEEP RTE 84+ / SPEC CTH 81+', 'Blazing deep threat with YAC ability; elite speed develops into a record-breaker.'),
      t('SPD 87+ / ACC 85+', 'DEEP RTE 79+', 'Burner who stretches the field; a fast riser.'),
      t('SPD 80+ / ACC 78+', 'DEEP RTE 74+', 'Good deep speed; a solid starter.'),
      t('Below speedster benchmarks', 'Under 76 composite', 'Average speed guy; limited.'),
    ]},
    'Route Artist': { tiers: [
      t('SHORT RTE 90+ / MED RTE 88+', 'CTH 87+ / DEEP RTE 85+', 'Master technician who gets open at will; elite route-running drives superstar growth.'),
      t('SHORT RTE 84+ / MED RTE 82+', 'CTH 81+ / DEEP RTE 79+', 'Precise separator; develops quickly.'),
      t('SHORT RTE 77+ / MED RTE 75+', 'CTH 74+', 'Reliable route-runner; a good producer.'),
      t('Below route benchmarks', 'Under 76 composite', 'Basic routes; slow growth.'),
    ]},
    'Elusive Route Runner': { tiers: [
      t('AGI 90+ / SHORT RTE 88+', 'SPD 87+ / MED RTE 85+', 'Shifty separator with YAC ability; elite quickness develops into a star.'),
      t('AGI 84+ / SHORT RTE 82+', 'SPD 81+ / MED RTE 80+', 'Crafty mover; a strong riser.'),
      t('AGI 77+ / SHORT RTE 75+', 'SPD 74+', 'Good elusiveness; solid.'),
      t('Below elusive benchmarks', 'Under 76 composite', 'Average shifter.'),
    ]},
    'Physical Route Runner': { tiers: [
      t('CIT 90+ / MED RTE 88+', 'CTH 87+ / SPEC CTH 85+', 'Big, physical bully at the line; elite strength fuels dominant growth.'),
      t('CIT 84+ / MED RTE 82+', 'CTH 81+', 'Strong contested winner; good development.'),
      t('CIT 77+ / MED RTE 74+', 'CTH 73+', 'Physical presence; reliable.'),
      t('Below physical benchmarks', 'Under 76 composite', 'Average physicality.'),
    ]},
    'Gritty Possession': { tiers: [
      t('CIT 90+ / CTH 88+', 'SHORT RTE 86+ / MED RTE 83+', 'Tough chain-mover with strong hands; elite reliability develops into a possession king.'),
      t('CIT 84+ / CTH 83+', 'SHORT RTE 80+ / MED RTE 79+', 'Reliable possession guy; quick growth.'),
      t('CIT 76+ / CTH 75+', 'SHORT RTE 74+', 'Solid middle-of-field threat.'),
      t('Below possession benchmarks', 'Under 76 composite', 'Basic possession receiver.'),
    ]},
    'Contested Specialist': { tiers: [
      t('SPEC CTH 91+ / CIT 88+', 'CTH 87+ / DEEP RTE 84+', 'Jump-ball and red-zone monster; elite catch radius drives superstar development.'),
      t('SPEC CTH 85+ / CIT 82+', 'CTH 82+ / DEEP RTE 79+', 'Strong 50/50 winner; a solid riser.'),
      t('SPEC CTH 78+ / CIT 76+', 'CTH 74+', 'Good contested catcher.'),
      t('Below contested benchmarks', 'Under 76 composite', 'Average in traffic.'),
    ]},
    'Gadget': { tiers: [
      t('SPD 90+ / ACC 88+', 'AGI 86+ / CTH 85+', 'Versatile gadget playmaker for trick plays and motion; explosive development.'),
      t('SPD 84+ / ACC 82+', 'AGI 81+ / CTH 80+', 'Creative weapon; good growth.'),
      t('SPD 77+ / ACC 75+', 'AGI 73+', 'Useful gadget guy.'),
      t('Below gadget benchmarks', 'Under 76 composite', 'Basic utility.'),
    ]},
  },

  TE: {
    archetypes: ['Vertical Threat', 'Pure Possession', 'Gritty Possession', 'Physical Route Runner', 'Pure Blocker'],
    'Vertical Threat': { tiers: [
      t('SPD 89+ / ACC 87+', 'MED RTE 84+ / CTH 83+', 'Speedy seam-stretcher and mismatch nightmare; elite athleticism drives rapid growth.'),
      t('SPD 83+ / ACC 82+', 'MED RTE 81+ / CTH 80+', 'Big deep threat; strong development.'),
      t('SPD 77+ / ACC 75+', 'CTH 73+', 'Good vertical weapon.'),
      t('Below vertical benchmarks', 'Under 76 composite', 'Average seam guy.'),
    ]},
    'Pure Possession': { tiers: [
      t('CTH 89+ / CIT 87+', 'SHORT RTE 85+ / MED RTE 83+', 'Reliable hands machine in the middle; elite consistency puts him on a superstar trajectory.'),
      t('CTH 83+ / CIT 82+', 'SHORT RTE 80+ / MED RTE 79+', 'Strong possession target; a quick riser.'),
      t('CTH 76+ / CIT 74+', 'SHORT RTE 73+', 'Solid chain-mover.'),
      t('Below possession benchmarks', 'Under 76 composite', 'Basic receiver.'),
    ]},
    'Gritty Possession': { tiers: [
      t('CIT 90+ / SHORT RTE 87+', 'CTH 85+ / STR 83+', 'Tough contested winner; elite physicality drives dominant growth.'),
      t('CIT 84+ / SHORT RTE 81+', 'CTH 81+ / STR 79+', 'Gritty, reliable option.'),
      t('CIT 76+ / SHORT RTE 74+', 'CTH 74+', 'Physical possession guy.'),
      t('Below gritty benchmarks', 'Under 76 composite', 'Average.'),
    ]},
    'Physical Route Runner': { tiers: [
      t('MED RTE 89+ / CIT 86+', 'CTH 85+ / STR 83+', 'Big, athletic route-runner; elite size and skill combine for star potential.'),
      t('MED RTE 83+ / CIT 81+', 'CTH 80+ / STR 79+', 'Strong mover; good development.'),
      t('MED RTE 76+ / CIT 74+', 'CTH 73+', 'Physical receiver.'),
      t('Below route benchmarks', 'Under 76 composite', 'Basic.'),
    ]},
    'Pure Blocker': { tiers: [
      t('RUN BLK 91+ / PASS BLK 88+', 'STR 87+ / IMP BLK 84+', 'In-line blocking destroyer; elite strength develops into a run-game anchor.'),
      t('RUN BLK 85+ / PASS BLK 82+', 'STR 83+ / IMP BLK 80+', 'Outstanding blocker.'),
      t('RUN BLK 77+ / PASS BLK 75+', 'STR 74+', 'Solid run supporter.'),
      t('Below blocker benchmarks', 'Under 76 composite', 'Average blocker.'),
    ]},
  },

  OT: {
    archetypes: ['Well Rounded', 'Pass Protector', 'Agile', 'Raw Strength'],
    'Well Rounded': { tiers: [
      t('RUN BLK 89+ / PASS BLK 87+', 'RBP 85+ / PBP 84+', 'Complete lineman excelling in both run and pass; elite versatility drives fast development.'),
      t('RUN BLK 83+ / PASS BLK 81+', 'RBP 79+ / PBP 78+', 'Balanced, high-level player.'),
      t('RUN BLK 76+ / PASS BLK 75+', 'RBP 73+ / PBP 72+', 'Solid all-around.'),
      t('Below balanced benchmarks', 'Under 76 composite', 'Average versatile.'),
    ]},
    'Pass Protector': { tiers: [
      t('PASS BLK 91+ / PBP 88+', 'PB FIN 86+', 'Pocket protector supreme with elite feet; rapid growth into a blindside star.'),
      t('PASS BLK 85+ / PBP 82+', 'PB FIN 80+', 'Excellent pass blocker.'),
      t('PASS BLK 77+ / PBP 75+', 'PB FIN 74+', 'Good protector.'),
      t('Below protection benchmarks', 'Under 76 composite', 'Basic.'),
    ]},
    'Agile': { tiers: [
      t('PB FIN 90+ / RB FIN 88+', 'AGI 87+ / ACC 84+', 'Athletic mover who pulls and mirrors; elite quickness drives dynamic development.'),
      t('PB FIN 84+ / RB FIN 82+', 'AGI 81+ / ACC 80+', 'Quick, reactive lineman.'),
      t('PB FIN 77+ / RB FIN 75+', 'AGI 73+', 'Athletic contributor.'),
      t('Below agile benchmarks', 'Under 76 composite', 'Average agility.'),
    ]},
    'Raw Strength': { tiers: [
      t('RB PWR 91+ / PBP 88+', 'IMP BLK 87+', 'Mauler with elite power; dominates the run game with superstar growth.'),
      t('RB PWR 85+ / PBP 82+', 'IMP BLK 82+', 'Powerful drive blocker.'),
      t('RB PWR 77+ / PBP 75+', 'IMP BLK 74+', 'Strong run guy.'),
      t('Below strength benchmarks', 'Under 76 composite', 'Basic power.'),
    ]},
  },

  OG: {
    archetypes: ['Well Rounded', 'Pass Protector', 'Agile', 'Raw Strength'],
    'Well Rounded': { tiers: [
      t('RUN BLK 89+ / PASS BLK 87+', 'RBP 85+ / PBP 84+', 'Complete lineman excelling in both run and pass; elite versatility drives fast development.'),
      t('RUN BLK 83+ / PASS BLK 81+', 'RBP 79+ / PBP 78+', 'Balanced, high-level player.'),
      t('RUN BLK 76+ / PASS BLK 75+', 'RBP 73+ / PBP 72+', 'Solid all-around.'),
      t('Below balanced benchmarks', 'Under 76 composite', 'Average versatile.'),
    ]},
    'Pass Protector': { tiers: [
      t('PASS BLK 91+ / PBP 88+', 'PB FIN 86+', 'Pocket protector supreme with elite feet; rapid growth into a blindside star.'),
      t('PASS BLK 85+ / PBP 82+', 'PB FIN 80+', 'Excellent pass blocker.'),
      t('PASS BLK 77+ / PBP 75+', 'PB FIN 73+', 'Good protector.'),
      t('Below protection benchmarks', 'Under 76 composite', 'Basic.'),
    ]},
    'Agile': { tiers: [
      t('RB FIN 90+ / PB FIN 87+', 'AGI 86+ / ACC 85+', 'Athletic mover who pulls and mirrors; elite quickness drives dynamic development.'),
      t('RB FIN 84+ / PB FIN 81+', 'AGI 80+ / ACC 79+', 'Quick, reactive lineman.'),
      t('RB FIN 77+ / PB FIN 74+', 'AGI 73+', 'Athletic contributor.'),
      t('Below agile benchmarks', 'Under 76 composite', 'Average agility.'),
    ]},
    'Raw Strength': { tiers: [
      t('RB PWR 91+ / PBP 89+', 'IMP BLK 88+', 'Mauler with elite power; dominates the run game with superstar growth.'),
      t('RB PWR 85+ / PBP 83+', 'IMP BLK 82+', 'Powerful drive blocker.'),
      t('RB PWR 77+ / PBP 75+', 'IMP BLK 74+', 'Strong run guy.'),
      t('Below strength benchmarks', 'Under 76 composite', 'Basic power.'),
    ]},
  },

  C: {
    archetypes: ['Well Rounded', 'Pass Protector', 'Agile', 'Raw Strength'],
    'Well Rounded': { tiers: [
      t('RUN BLK 89+ / PASS BLK 87+', 'AWR 85+ / RBP 83+', 'Complete lineman excelling in both run and pass; elite versatility drives fast development.'),
      t('RUN BLK 83+ / PASS BLK 81+', 'AWR 80+ / RBP 79+', 'Balanced, high-level player.'),
      t('RUN BLK 76+ / PASS BLK 74+', 'AWR 73+', 'Solid all-around.'),
      t('Below balanced benchmarks', 'Under 76 composite', 'Average versatile.'),
    ]},
    'Pass Protector': { tiers: [
      t('PASS BLK 90+ / PBP 87+', 'PB FIN 85+ / AWR 84+', 'Pocket protector supreme with elite feet; rapid growth into a blindside star.'),
      t('PASS BLK 84+ / PBP 81+', 'PB FIN 80+ / AWR 79+', 'Excellent pass blocker.'),
      t('PASS BLK 76+ / PBP 74+', 'PB FIN 73+', 'Good protector.'),
      t('Below protection benchmarks', 'Under 76 composite', 'Basic.'),
    ]},
    'Agile': { tiers: [
      t('RB FIN 90+ / PB FIN 87+', 'AGI 86+ / AWR 84+', 'Athletic mover who pulls and mirrors; elite quickness drives dynamic development.'),
      t('RB FIN 84+ / PB FIN 81+', 'AGI 80+ / AWR 79+', 'Quick, reactive lineman.'),
      t('RB FIN 77+ / PB FIN 74+', 'AGI 73+', 'Athletic contributor.'),
      t('Below agile benchmarks', 'Under 76 composite', 'Average agility.'),
    ]},
    'Raw Strength': { tiers: [
      t('RB PWR 90+ / PBP 88+', 'IMP BLK 87+ / AWR 84+', 'Mauler with elite power; dominates the run game with superstar growth.'),
      t('RB PWR 84+ / PBP 82+', 'IMP BLK 81+ / AWR 79+', 'Powerful drive blocker.'),
      t('RB PWR 76+ / PBP 74+', 'IMP BLK 73+', 'Strong run guy.'),
      t('Below strength benchmarks', 'Under 76 composite', 'Basic power.'),
    ]},
  },

  DE: {
    archetypes: ['Speed Rusher', 'Power Rusher', 'Edge Setter', 'Pure Power'],
    'Speed Rusher': { tiers: [
      t('FIN MVS 91+ / SPD 89+', 'ACC 88+ / PURS 83+', 'Explosive first-step terror; elite bend and speed develop a sack artist.'),
      t('FIN MVS 85+ / SPD 84+', 'ACC 83+ / PURS 80+', 'Dynamic edge rusher.'),
      t('FIN MVS 78+ / SPD 77+', 'ACC 76+', 'Good speed guy.'),
      t('Below speed benchmarks', 'Under 76 composite', 'Average.'),
    ]},
    'Power Rusher': { tiers: [
      t('PWR MVS 91+ / STR 88+', 'BLK SHED 87+ / HIT PWR 84+', 'Bull-rush dominator; elite strength drives rapid growth.'),
      t('PWR MVS 85+ / STR 83+', 'BLK SHED 82+ / HIT PWR 80+', 'Powerful pass rusher.'),
      t('PWR MVS 78+ / STR 76+', 'BLK SHED 74+', 'Solid power.'),
      t('Below power benchmarks', 'Under 76 composite', 'Basic.'),
    ]},
    'Edge Setter': { tiers: [
      t('BLK SHED 90+ / TAK 87+', 'HIT PWR 86+ / STR 84+', 'Run-defense anchor who sets the edge perfectly; elite discipline puts him on a star trajectory.'),
      t('BLK SHED 84+ / TAK 82+', 'HIT PWR 83+ / STR 80+', 'Strong contain artist.'),
      t('BLK SHED 77+ / TAK 76+', 'STR 74+', 'Good vs. the run.'),
      t('Below edge benchmarks', 'Under 76 composite', 'Average.'),
    ]},
    'Pure Power': { tiers: [
      t('PWR MVS 91+ / STR 88+', 'BLK SHED 86+ / HIT PWR 85+', 'Run-stuffing monster; elite strength develops into a disruptor.'),
      t('PWR MVS 85+ / STR 83+', 'BLK SHED 82+', 'Dominant power player.'),
      t('PWR MVS 78+ / STR 77+', 'BLK SHED 75+', 'Strong inside.'),
      t('Below power benchmarks', 'Under 76 composite', 'Basic.'),
    ]},
  },

  DT: {
    archetypes: ['Speed Rusher', 'Power Rusher', 'Edge Setter', 'Pure Power', 'Gap Specialist'],
    'Speed Rusher': { tiers: [
      t('FIN MVS 91+ / SPD 88+', 'ACC 87+ / PURS 83+', 'Explosive first-step terror; elite bend and speed develop a sack artist.'),
      t('FIN MVS 85+ / SPD 83+', 'ACC 82+ / PURS 79+', 'Dynamic edge rusher.'),
      t('FIN MVS 78+ / SPD 76+', 'ACC 75+', 'Good speed guy.'),
      t('Below speed benchmarks', 'Under 76 composite', 'Average.'),
    ]},
    'Power Rusher': { tiers: [
      t('PWR MVS 91+ / STR 88+', 'BLK SHED 87+ / HIT PWR 84+', 'Bull-rush dominator; elite strength drives rapid growth.'),
      t('PWR MVS 85+ / STR 83+', 'BLK SHED 82+ / HIT PWR 80+', 'Powerful pass rusher.'),
      t('PWR MVS 78+ / STR 76+', 'BLK SHED 74+', 'Solid power.'),
      t('Below power benchmarks', 'Under 76 composite', 'Basic.'),
    ]},
    'Edge Setter': { tiers: [
      t('BLK SHED 91+ / TAK 87+', 'HIT PWR 86+ / STR 84+', 'Run-defense anchor who sets the edge perfectly; elite discipline puts him on a star trajectory.'),
      t('BLK SHED 85+ / TAK 82+', 'HIT PWR 83+ / STR 81+', 'Strong contain artist.'),
      t('BLK SHED 77+ / TAK 75+', 'HIT PWR 74+', 'Good vs. the run.'),
      t('Below edge benchmarks', 'Under 76 composite', 'Average.'),
    ]},
    'Pure Power': { tiers: [
      t('PWR MVS 91+ / STR 88+', 'BLK SHED 87+ / HIT PWR 85+', 'Run-stuffing monster; elite strength develops into a disruptor.'),
      t('PWR MVS 85+ / STR 83+', 'BLK SHED 82+ / HIT PWR 80+', 'Dominant power player.'),
      t('PWR MVS 78+ / STR 77+', 'BLK SHED 75+', 'Strong inside.'),
      t('Below pure power benchmarks', 'Under 76 composite', 'Basic.'),
    ]},
    'Gap Specialist': { tiers: [
      t('BLK SHED 91+ / TAK 88+', 'STR 87+ / HIT PWR 84+', 'Lightning gap-shooter; elite quickness drives disruptive growth.'),
      t('BLK SHED 85+ / TAK 83+', 'STR 82+ / HIT PWR 80+', 'Penetrating DT.'),
      t('BLK SHED 78+ / TAK 75+', 'STR 73+', 'Good shooter.'),
      t('Below gap benchmarks', 'Under 76 composite', 'Average.'),
    ]},
  },

  OLB: {
    archetypes: ['Thumper', 'Signal Caller', 'Lurker'],
    'Thumper': { tiers: [
      t('TAK 91+ / HIT PWR 89+', 'STR 87+ / PLAY REC 83+', 'Physical downhill destroyer; elite hitting and shedding drive star development.'),
      t('TAK 85+ / HIT PWR 83+', 'STR 82+ / PLAY REC 79+', 'Big hitter.'),
      t('TAK 77+ / HIT PWR 76+', 'STR 74+', 'Solid run defender.'),
      t('Below thumper benchmarks', 'Under 76 composite', 'Average.'),
    ]},
    'Signal Caller': { tiers: [
      t('PLAY REC 91+ / AWR 88+', 'TAK 85+ / PURS 83+', 'Defensive QB with elite IQ and pre-snap reads; rapid leadership growth.'),
      t('PLAY REC 85+ / AWR 83+', 'TAK 81+ / PURS 79+', 'Smart play-caller.'),
      t('PLAY REC 77+ / AWR 75+', 'TAK 73+', 'Good communicator.'),
      t('Below signal caller benchmarks', 'Under 76 composite', 'Basic.'),
    ]},
    'Lurker': { tiers: [
      t('ZONE COV 91+ / SPD 88+', 'PLAY REC 86+ / ACC 85+', 'Instinctive playmaker who creates turnovers; elite range drives superstar growth.'),
      t('ZONE COV 85+ / SPD 82+', 'PLAY REC 81+ / ACC 80+', 'Ball-hawking LB.'),
      t('ZONE COV 77+ / SPD 75+', 'PLAY REC 73+', 'Disruptive.'),
      t('Below lurker benchmarks', 'Under 76 composite', 'Average.'),
    ]},
  },

  MIKE: {
    archetypes: ['Thumper', 'Signal Caller', 'Lurker'],
    'Thumper': { tiers: [
      t('TAK 91+ / HIT PWR 89+', 'STR 87+ / PLAY REC 83+', 'Physical downhill destroyer; elite hitting and shedding drive star development.'),
      t('TAK 85+ / HIT PWR 83+', 'STR 82+ / PLAY REC 79+', 'Big hitter.'),
      t('TAK 77+ / HIT PWR 76+', 'STR 74+', 'Solid run defender.'),
      t('Below thumper benchmarks', 'Under 76 composite', 'Average.'),
    ]},
    'Signal Caller': { tiers: [
      t('PLAY REC 91+ / AWR 88+', 'TAK 86+ / PURS 84+', 'Defensive QB with elite IQ and pre-snap reads; rapid leadership growth.'),
      t('PLAY REC 85+ / AWR 83+', 'TAK 81+ / PURS 80+', 'Smart play-caller.'),
      t('PLAY REC 77+ / AWR 75+', 'TAK 73+', 'Good communicator.'),
      t('Below signal caller benchmarks', 'Under 76 composite', 'Basic.'),
    ]},
    'Lurker': { tiers: [
      t('ZONE COV 91+ / SPD 88+', 'PLAY REC 86+ / ACC 84+', 'Instinctive playmaker who creates turnovers; elite range drives superstar growth.'),
      t('ZONE COV 85+ / SPD 82+', 'PLAY REC 81+ / ACC 80+', 'Ball-hawking LB.'),
      t('ZONE COV 77+ / SPD 75+', 'PLAY REC 73+', 'Disruptive.'),
      t('Below lurker benchmarks', 'Under 76 composite', 'Average.'),
    ]},
  },

  CB: {
    archetypes: ['Field', 'Bump and Run', 'Boundary', 'Zone'],
    'Field': { tiers: [
      t('MAN COV 90+ / ZONE COV 88+', 'SPD 87+ / ACC 85+', 'Range for days, sideline-to-sideline lockdown; elite speed develops a shutdown corner.'),
      t('MAN COV 84+ / ZONE COV 82+', 'SPD 83+ / ACC 81+', 'Versatile deep cover guy.'),
      t('MAN COV 77+ / ZONE COV 75+', 'SPD 76+', 'Good coverage.'),
      t('Below field benchmarks', 'Under 76 composite', 'Average.'),
    ]},
    'Bump and Run': { tiers: [
      t('PRS 91+ / MAN COV 88+', 'SPD 87+ / ACC 84+', 'Physical press monster; elite strength and jams drive star growth.'),
      t('PRS 85+ / MAN COV 83+', 'SPD 82+ / ACC 80+', 'Press specialist.'),
      t('PRS 77+ / MAN COV 76+', 'SPD 75+', 'Strong at the line.'),
      t('Below press benchmarks', 'Under 76 composite', 'Basic.'),
    ]},
    'Boundary': { tiers: [
      t('MAN COV 90+ / PRS 87+', 'SPD 85+ / ACC 83+', 'Island lockdown artist; elite man coverage drives rapid development.'),
      t('MAN COV 84+ / PRS 82+', 'SPD 80+ / ACC 79+', 'Reliable outside CB.'),
      t('MAN COV 76+ / PRS 74+', 'SPD 73+', 'Solid boundary.'),
      t('Below boundary benchmarks', 'Under 76 composite', 'Average.'),
    ]},
    'Zone': { tiers: [
      t('ZONE COV 91+ / SPD 87+', 'ACC 85+ / AWR 84+', 'Zone-reading ball hawk; elite instincts fuel playmaking growth.'),
      t('ZONE COV 85+ / SPD 82+', 'ACC 82+ / AWR 81+', 'Smart zone player.'),
      t('ZONE COV 77+ / SPD 76+', 'ACC 74+ / AWR 73+', 'Good in zone.'),
      t('Below zone benchmarks', 'Under 76 composite', 'Basic.'),
    ]},
  },

  FS: {
    archetypes: ['Coverage Specialist', 'Hybrid', 'Box Specialist'],
    'Coverage Specialist': { tiers: [
      t('ZONE COV 91+ / SPD 88+', 'ACC 87+ / AWR 85+', 'Deep free safety with elite range and ball skills; a superstar development track.'),
      t('ZONE COV 85+ / SPD 83+', 'ACC 82+ / AWR 80+', 'Excellent cover safety.'),
      t('ZONE COV 77+ / SPD 76+', 'ACC 74+', 'Solid deep help.'),
      t('Below zone benchmarks', 'Under 76 composite', 'Average.'),
    ]},
    'Hybrid': { tiers: [
      t('ZONE COV 89+ / SPD 87+', 'TAK 85+ / ACC 84+', 'Versatile chess piece; elite all-around ability drives dynamic growth.'),
      t('ZONE COV 83+ / SPD 81+', 'TAK 81+ / ACC 80+', 'Multi-role safety.'),
      t('ZONE COV 76+ / SPD 74+', 'TAK 73+', 'Flexible contributor.'),
      t('Below hybrid benchmarks', 'Under 76 composite', 'Average hybrid.'),
    ]},
    'Box Specialist': { tiers: [
      t('TAK 90+ / SPD 84+', 'AWR 85+ / ACC 84+', 'Run-thumping box enforcer; elite physicality puts him on a star trajectory.'),
      t('TAK 84+ / SPD 80+', 'AWR 80+', 'Strong near-line safety.'),
      t('TAK 77+ / SPD 76+', 'AWR 74+', 'Good vs. the run.'),
      t('Below box benchmarks', 'Under 76 composite', 'Average.'),
    ]},
  },

  SS: {
    archetypes: ['Coverage Specialist', 'Box Specialist', 'Hybrid'],
    'Coverage Specialist': { tiers: [
      t('ZONE COV 91+ / SPD 88+', 'ACC 86+ / AWR 84+', 'Deep free safety with elite range and ball skills; a superstar development track.'),
      t('ZONE COV 85+ / SPD 83+', 'ACC 82+ / AWR 80+', 'Excellent cover safety.'),
      t('ZONE COV 76+ / SPD 74+', 'ACC 73+', 'Solid deep help.'),
      t('Below coverage benchmarks', 'Under 76 composite', 'Average.'),
    ]},
    'Box Specialist': { tiers: [
      t('TAK 92+ / SPD 87+', 'ACC 86+ / AWR 84+', 'Run-thumping box enforcer; elite physicality puts him on a star trajectory.'),
      t('TAK 86+ / SPD 82+', 'AWR 81+ / ACC 81+', 'Strong near-line safety.'),
      t('TAK 78+ / SPD 76+', 'AWR 73+', 'Good vs. the run.'),
      t('Below box benchmarks', 'Under 76 composite', 'Average.'),
    ]},
    'Hybrid': { tiers: [
      t('ZONE COV 89+ / SPD 87+', 'TAK 85+ / ACC 84+', 'Versatile chess piece; elite all-around ability drives dynamic growth.'),
      t('ZONE COV 83+ / SPD 81+', 'TAK 81+ / ACC 80+', 'Multi-role safety.'),
      t('ZONE COV 76+ / SPD 74+', 'TAK 73+', 'Flexible contributor.'),
      t('Below hybrid benchmarks', 'Under 76 composite', 'Average hybrid.'),
    ]},
  },

  ATH: {
    archetypes: ['Dual Threat', 'Pure Runner', 'East/West Playmaker', 'Backfield Threat', 'Contested Specialist', 'Physical Route Runner', 'Power Rusher', 'Thumper', 'Lurker', 'Pure Possession', 'Agile', 'Contact Seeker'],
    'Dual Threat': { tiers: [
      t('SPD 90+ / THR/RUN 87+', 'ACC 86+ / THR PWR 85+', 'Explosive dual-threat with elite arm and legs; absurd development into a franchise game-changer.'),
      t('SPD 84+ / THR/RUN 82+', 'ACC 81+ / THR PWR 80+', 'Strong passer-runner hybrid; fast growth into a dynamic star.'),
      t('SPD 78+ / THR/RUN 75+', 'ACC 73+', 'Balanced mobility and accuracy; a solid developmental piece.'),
      t('Below dual benchmarks', 'Under 76 composite', 'Decent dual skills; slow, average growth.'),
    ]},
    'Pure Runner': { tiers: [
      t('SPD 93+ / ACC 91+', 'THR/RUN 85+', 'Elite speed rusher and scrambler; develops into an unstoppable run threat.'),
      t('SPD 87+ / ACC 85+', 'THR/RUN 80+', 'Explosive pure runner; a quick riser as a leg weapon.'),
      t('SPD 80+ / ACC 77+', 'THR/RUN 73+', 'Strong runner with limited passing; a good contributor.'),
      t('Below runner benchmarks', 'Under 76 composite', 'Basic mobile athlete; slow development.'),
    ]},
    'East/West Playmaker': { tiers: [
      t('SPD 90+ / ACC 88+', 'COD 87+ / JUKE 85+', 'Shifty lateral big-play specialist; elite change of direction and speed drive superstar development.'),
      t('SPD 84+ / ACC 83+', 'COD 82+ / JUKE 80+', 'Explosive east-west mover; strong growth.'),
      t('SPD 77+ / ACC 76+', 'COD 74+', 'Good cutback vision; a reliable playmaker.'),
      t('Below EW benchmarks', 'Under 76 composite', 'Average lateral athlete; slow growth.'),
    ]},
    'Backfield Threat': { tiers: [
      t('CTH 90+ / SPD 88+', 'ACC 85+ / COD 84+', 'Versatile receiving and rushing weapon; elite hands and vision drive rapid superstar growth.'),
      t('CTH 84+ / SPD 83+', 'ACC 81+ / COD 80+', 'Dynamic backfield pass-catcher; fast development.'),
      t('CTH 77+ / SPD 75+', 'ACC 73+', 'Solid receiver-runner; a useful multi-tool.'),
      t('Below backfield benchmarks', 'Under 76 composite', 'Average backfield threat; slow growth.'),
    ]},
    'Contested Specialist': { tiers: [
      t('SPEC CTH 91+ / CIT 88+', 'CTH 87+ / DEEP RTE 84+', 'Elite 50/50 jump-ball winner; absurd physical development into a red-zone star.'),
      t('SPEC CTH 85+ / CIT 82+', 'CTH 82+ / DEEP RTE 79+', 'Strong contested catcher; a quick riser.'),
      t('SPEC CTH 78+ / CIT 76+', 'CTH 74+', 'Good in traffic; a solid target.'),
      t('Below contested benchmarks', 'Under 76 composite', 'Basic contested athlete; slow growth.'),
    ]},
    'Physical Route Runner': { tiers: [
      t('SPD 90+ / MED RTE 87+', 'CIT 85+ / CTH 84+', 'Big, physical separator; elite strength and routes develop a dominant mismatch.'),
      t('SPD 84+ / MED RTE 82+', 'CIT 81+ / CTH 80+', 'Strong route-runner with power; good growth.'),
      t('SPD 77+ / MED RTE 74+', 'CIT 73+', 'Physical presence; reliable.'),
      t('Below physical route benchmarks', 'Under 76 composite', 'Average physical athlete.'),
    ]},
    'Power Rusher': { tiers: [
      t('PWR MVS 91+ / STR 88+', 'BLK SHED 86+ / HIT PWR 84+', 'Bull-rush power monster; elite strength drives rapid development into a sack artist.'),
      t('PWR MVS 85+ / STR 83+', 'BLK SHED 82+ / HIT PWR 80+', 'Dominant power rusher; a strong riser.'),
      t('PWR MVS 78+ / STR 76+', 'BLK SHED 74+', 'Solid power defender; a good contributor.'),
      t('Below power rusher benchmarks', 'Under 76 composite', 'Basic power athlete; slow growth.'),
    ]},
    'Thumper': { tiers: [
      t('TAK 91+ / HIT PWR 89+', 'STR 87+ / PLAY REC 83+', 'Physical downhill hitter; elite toughness develops into a defensive star.'),
      t('TAK 85+ / HIT PWR 83+', 'STR 82+ / PLAY REC 79+', 'Big-contact thumper; fast growth.'),
      t('TAK 77+ / HIT PWR 76+', 'STR 73+', 'Strong run defender; solid.'),
      t('Below thumper benchmarks', 'Under 76 composite', 'Average hitter; slow development.'),
    ]},
    'Lurker': { tiers: [
      t('ZONE COV 90+ / SPD 88+', 'PLAY REC 86+ / ACC 84+', 'Instinctive playmaker who creates turnovers; elite range drives superstar growth.'),
      t('ZONE COV 84+ / SPD 82+', 'PLAY REC 81+ / ACC 80+', 'Ball-hawking lurker; quick development.'),
      t('ZONE COV 76+ / SPD 74+', 'PLAY REC 73+', 'Disruptive in coverage; a good piece.'),
      t('Below lurker benchmarks', 'Under 76 composite', 'Basic lurker; slow growth.'),
    ]},
    'Pure Possession': { tiers: [
      t('CTH 89+ / CIT 87+', 'SHORT RTE 85+ / MED RTE 83+', 'Reliable hands machine; elite consistency develops into a chain-moving star.'),
      t('CTH 83+ / CIT 82+', 'SHORT RTE 80+ / MED RTE 79+', 'Strong possession receiver; a solid riser.'),
      t('CTH 76+ / CIT 74+', 'SHORT RTE 73+', 'Reliable catcher; useful.'),
      t('Below possession benchmarks', 'Under 76 composite', 'Average possession athlete.'),
    ]},
    // ATH - Agile shares OT/OG/C's blocking-oriented attribute list (Run
    // Block / Pass Block family + Agility/Acceleration), not an open-field
    // movement profile — these benchmarks match OT's own 'Agile' tiers.
    'Agile': { tiers: [
      t('PB FIN 90+ / RB FIN 88+', 'AGI 87+ / ACC 84+', 'Athletic mover who pulls and mirrors; elite quickness drives dynamic development.'),
      t('PB FIN 84+ / RB FIN 82+', 'AGI 81+ / ACC 80+', 'Quick, reactive blocker.'),
      t('PB FIN 77+ / RB FIN 75+', 'AGI 73+', 'Athletic contributor.'),
      t('Below agile benchmarks', 'Under 76 composite', 'Average agility.'),
    ]},
    'Contact Seeker': { tiers: [
      t('BRK TKL 91+ / CAR 89+', 'BC VIS 85+ / AWR 83+', 'Downhill physical beast; elite power and trucking develop a dominant runner/hitter.'),
      t('BRK TKL 85+ / CAR 83+', 'BC VIS 79+', 'Tough contact seeker; strong growth.'),
      t('BRK TKL 77+ / CAR 76+', 'BC VIS 72+', 'Physical runner/defender; reliable.'),
      t('Below contact benchmarks', 'Under 76 composite', 'Average contact player; slow development.'),
    ]},
  },

  FB: {
    archetypes: ['Blocking', 'Utility'],
    'Blocking': { tiers: [
      t('LBK 91+ / RUN BLK 88+', 'IMP BLK 86+ / STR 84+', 'Pancake machine and elite lead blocker; rare dominance in the run game.'),
      t('LBK 85+ / RUN BLK 82+', 'IMP BLK 80+ / STR 79+', 'Outstanding blocker with toughness; a strong contributor.'),
      t('LBK 78+ / RUN BLK 76+', 'STR 74+', 'Reliable lead blocker; a good starter.'),
      t('Below blocking benchmarks', 'Under 76 composite', 'Basic blocker; limited impact.'),
    ]},
    'Utility': { tiers: [
      t('CAR 89+ / TRK 87+', 'BRK TKL 85+ / SHORT RTE 83+', 'Versatile do-it-all FB who blocks, runs, and catches; a rare multi-tool threat.'),
      t('CAR 83+ / TRK 81+', 'BRK TKL 79+ / SHORT RTE 77+', 'Good all-around contributor; solid development.'),
      t('CAR 76+ / TRK 74+', 'BRK TKL 73+', 'Flexible role player; useful.'),
      t('Below utility benchmarks', 'Under 76 composite', 'Average utility; slow growth.'),
    ]},
  },

  K: {
    archetypes: ['Accurate', 'Power'],
    'Accurate': { tiers: [
      t('KAC 92+ / AWR 87+', 'KPW 82+', 'Clutch precision leg with elite consistency; a rare, automatic weapon.'),
      t('KAC 86+ / AWR 81+', 'KPW 78+', 'Highly reliable.'),
      t('KAC 79+ / AWR 75+', 'KPW 73+', 'Good accuracy.'),
      t('Below accuracy benchmarks', 'Under 76 composite', 'Average.'),
    ]},
    'Power': { tiers: [
      t('KPW 93+ / AWR 84+', 'KAC 82+', 'Cannon leg for distance and hang time; elite power drives game-changing development.'),
      t('KPW 87+ / AWR 79+', 'KAC 77+', 'Big-legged specialist.'),
      t('KPW 80+ / AWR 74+', 'KAC 73+', 'Strong distance.'),
      t('Below power benchmarks', 'Under 76 composite', 'Average power.'),
    ]},
  },

  P: {
    archetypes: ['Accurate', 'Power'],
    'Accurate': { tiers: [
      t('KAC 92+ / AWR 87+', 'KPW 82+', 'Clutch precision leg with elite hang-time control; a rare, automatic weapon.'),
      t('KAC 86+ / AWR 81+', 'KPW 78+', 'Highly reliable.'),
      t('KAC 79+ / AWR 75+', 'KPW 73+', 'Good accuracy.'),
      t('Below accuracy benchmarks', 'Under 76 composite', 'Average.'),
    ]},
    'Power': { tiers: [
      t('KPW 93+ / AWR 84+', 'KAC 82+', 'Booming leg with elite distance and hang time; drives game-changing field position.'),
      t('KPW 87+ / AWR 79+', 'KAC 77+', 'Big-legged specialist.'),
      t('KPW 80+ / AWR 74+', 'KAC 73+', 'Strong distance.'),
      t('Below power benchmarks', 'Under 76 composite', 'Average power.'),
    ]},
  },
};

export const POSITIONS = ['QB','HB','FB','WR','TE','OT','OG','C','DE','DT','OLB','MIKE','CB','FS','SS','K','P','ATH'];
export { PROFILES };

// Which attributes actually separate one tier from an adjacent one — the
// attribute with the biggest gap is the strongest signal for what it takes to
// be in this tier rather than the other one. `direction` controls the
// comparison: 'above' (Elite/Star/Impact, each compared against the tier
// directly below them) ranks by this tier's FLOOR (minimum) clearing the
// lower tier's AVERAGE — a tier's worst-case recruit still beating what's
// merely typical one tier down is a stronger, more decisive signal than two
// averages sitting a bit apart. Normal has no tier below it, so it's compared
// against Impact instead with `direction: 'below'` — ranked by average vs
// average, since here Normal's average is expected to be the LOWER one,
// describing Normal as falling beneath Impact's own bar rather than clearing
// a bar of its own. Either way, only a positive gap in the expected direction
// counts, and both tiers being compared need real revealed data — with only
// one side populated there's nothing to take a gap against, so it falls back
// to the static description.
function tierSeparationEntries(currentProfile, otherProfile, formAttrs, n = 4, direction = 'above') {
  if (!currentProfile || !otherProfile) return [];
  return formAttrs
    .map(attr => {
      if (direction === 'below') {
        const curAvg = currentProfile.stats[attr]?.avg;
        const otherAvg = otherProfile.stats[attr]?.avg;
        if (curAvg == null || otherAvg == null) return null;
        const gap = otherAvg - curAvg;
        return gap > 0 ? [attr, gap, otherAvg] : null;
      }
      const curMin = currentProfile.stats[attr]?.min;
      const otherAvg = otherProfile.stats[attr]?.avg;
      if (curMin == null || otherAvg == null) return null;
      const gap = curMin - otherAvg;
      return gap > 0 ? [attr, gap, otherAvg] : null;
    })
    .filter(Boolean)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

// Build "Attr 92+ / Attr2 89+" from a tier's own observed average — the same
// number shown in that tier's Attribute Breakdown, so the two never disagree.
// For direction 'below' (Normal), it instead reads as "Attr <92" using
// Impact's own average as the bar Normal falls under, rather than computing a
// separate "Normal average" number that wouldn't match anything shown elsewhere.
function dynamicBadgeText(profile, attrEntries, direction = 'above') {
  if (!profile || !attrEntries.length) return null;
  const parts = attrEntries.map(([attr, , otherAvg]) => {
    if (direction === 'below') {
      if (otherAvg == null) return null;
      return `${ATTR_SHORT[attr] || attr} <${Math.round(otherAvg)}`;
    }
    const stat = profile.stats[attr];
    if (!stat || stat.avg == null) return null;
    return `${ATTR_SHORT[attr] || attr} ${Math.round(stat.avg)}+`;
  }).filter(Boolean);
  return parts.length ? parts.join(' / ') : null;
}

export default function ThresholdLookup({ players = [], teamColors, teamLogo, dynastyId = null }) {
  const { getStaffData } = createStaffAccessor(dynastyId);
  const { toast } = useToast();
  const p = teamColors?.primary || '#374151';
  const [activePos, setActivePos] = useState('QB');
  const [activeArch, setActiveArch] = useState('Pocket Passer');
  const [activeStar, setActiveStar] = useState('5');
  const [showLearned, setShowLearned] = useState(false);
  const [openTiers, setOpenTiers] = useState(() => new Set());
  const toggleTier = i => setOpenTiers(prev => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });
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
    setOpenTiers(new Set());
  };

  const tierData = profile[activeArch]?.tiers ?? [];
  const archNorm = normalizeArch(activeArch);
  const formAttrs = useMemo(() => getFormAttrs(activePos, archNorm), [activePos, archNorm]);

  // Revealed-devTrait-only HS recruit pool — feeds badges, stats, and derived weights.
  const pool = useMemo(() => buildRevealedPool(players), [players]);

  // Full sweep across every position/archetype/star bucket for the "Learned"
  // panel — only computed while that panel is actually open, since it's a
  // full scan rather than the single active bucket the rest of this page
  // reads. Nested shape doubles as the exact payload the Copy All button
  // serializes, so what you see is what you copy.
  const learnedWeightsData = useMemo(() => {
    if (!showLearned) return {};
    const result = {};
    POSITIONS.forEach(pos => {
      (PROFILES[pos]?.archetypes || []).forEach(arch => {
        const archN = normalizeArch(arch);
        const attrs = getFormAttrs(pos, archN);
        STAR_TABS.forEach(star => {
          const { weights, boundariesUsed } = computeAttributeQuality(pool, pos, archN, star, attrs);
          if (weights) {
            result[pos] ??= {};
            result[pos][arch] ??= {};
            result[pos][arch][star] = { boundariesUsed, weights };
          }
        });
      });
    });
    return result;
  }, [pool, showLearned]);

  const learnedRows = useMemo(() => {
    const rows = [];
    Object.entries(learnedWeightsData).forEach(([pos, archs]) => {
      Object.entries(archs).forEach(([arch, stars]) => {
        Object.entries(stars).forEach(([star, data]) => {
          rows.push({ pos, arch, star, ...data });
        });
      });
    });
    return rows;
  }, [learnedWeightsData]);

  const handleCopyLearned = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(learnedWeightsData, null, 2));
      toast.success('Learned weights copied to clipboard.');
    } catch (err) {
      toast.error('Could not copy — your browser may be blocking clipboard access.');
    }
  };

  // One profile per dev trait (Elite/Star/Impact/Normal), each independently
  // qualifying once it has n >= MIN_N samples at the active star. Star levels
  // are never pooled together.
  const tierProfiles = useMemo(
    () => getAllTierProfiles(pool, activePos, archNorm, activeStar, formAttrs),
    [pool, activePos, archNorm, activeStar, formAttrs]
  );

  // Attribute weights derived live for whichever position+archetype+star the
  // user has selected (not gated by whatever combos happen to already be in
  // `players` — this is a browsing tool, not per-player scoring). No static
  // fallback: `weights` is null until real 2-sided tier data exists somewhere
  // in this exact bucket.
  const attrQuality = useMemo(
    () => computeAttributeQuality(pool, activePos, archNorm, activeStar, formAttrs),
    [pool, activePos, archNorm, activeStar, formAttrs]
  );
  const weightsInfo = {
    learned: !!attrQuality.weights,
    boundariesUsed: attrQuality.boundariesUsed,
    weights: attrQuality.weights ?? {},
  };

  const tierAttrStats = TIER_STYLES.map(({ devTrait }) => {
    const prof = tierProfiles[devTrait];
    return {
      count: prof?.n ?? 0,
      level: prof?.level ?? 'none',
      attrs: formAttrs,
      weights: weightsInfo.weights ?? {},
      stats: prof?.stats ?? {},
    };
  });

  return (
    <div className="space-y-4">
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
        <div className="flex-1 rounded-xl p-3 flex items-start justify-between gap-3 bg-surface-2 border border-surface-4 sm:h-[100px]">
          <div className="flex flex-col justify-center gap-1.5 h-full">
            <p className="text-base font-semibold text-txt-primary">Threshold Benchmarks</p>
            <p className="text-xs text-txt-tertiary leading-snug">With the current data compiled, these are the thresholds to target at each tier. Benchmarks adjust as more players are scouted.</p>
          </div>
          <button
            onClick={() => setShowLearned(true)}
            className="flex-shrink-0 text-[10px] font-display font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border border-surface-4 text-txt-secondary hover:text-txt-primary hover:bg-surface-3 transition"
          >
            Learned
          </button>
        </div>
      </div>

      {showLearned && (
        <div
          className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
          style={{ margin: 0 }}
          onClick={() => setShowLearned(false)}
        >
          <div
            className="bg-surface-2 border border-surface-4 rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-surface-4 flex-shrink-0">
              <div>
                <h2 className="text-sm font-display font-bold uppercase text-txt-primary">Learned Weights</h2>
                <p className="text-[10px] text-txt-tertiary mt-0.5">
                  {learnedRows.length} bucket{learnedRows.length !== 1 ? 's' : ''} with enough real comps to learn attribute weights
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={handleCopyLearned}
                  disabled={learnedRows.length === 0}
                  className="text-xs font-display font-bold uppercase text-txt-secondary hover:text-txt-primary transition px-3 py-1.5 rounded-lg border border-surface-4 hover:bg-surface-3 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Copy All
                </button>
                <button
                  onClick={() => setShowLearned(false)}
                  className="text-xs font-display font-bold uppercase text-txt-secondary hover:text-txt-primary transition px-3 py-1.5 rounded-lg border border-surface-4 hover:bg-surface-3"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="px-5 py-3 border-b border-surface-4 flex-shrink-0 bg-surface-3">
              <p className="text-xs text-txt-secondary leading-relaxed">
                These percentages show which attributes matter most for grading a recruit at this exact
                position, archetype, and star level — learned entirely from real scouted comps, never
                guessed. For every pair of adjacent dev-trait tiers with enough data (e.g. Impact vs.
                Star), the system checks how cleanly each attribute's values separate the two groups: one
                where the tiers barely overlap gets weighted heavily, one where they overlap a lot gets
                weighted lightly — but never zero. Those results are summed and normalized into the
                weights below, which power a recruit's "Learned Attribute Score" once a bucket has enough
                real data to learn from.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {learnedRows.length === 0 ? (
                <p className="text-xs text-txt-tertiary italic text-center py-10">
                  Not enough data yet — no position/archetype/star bucket has real 2-sided comps to learn weights from.
                </p>
              ) : (
                learnedRows.map(({ pos, arch, star, boundariesUsed, weights }) => (
                  <div key={`${pos}-${arch}-${star}`} className="bg-surface-3 border border-surface-4 rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="text-xs font-bold text-txt-primary">{pos} · {arch} · {star}★</p>
                      <p className="text-[10px] text-txt-tertiary flex-shrink-0">{boundariesUsed} boundar{boundariesUsed !== 1 ? 'ies' : 'y'}</p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {Object.entries(weights).sort((a, b) => b[1] - a[1]).map(([attr, w]) => (
                        <div key={attr} className="flex justify-between items-center gap-1.5 bg-surface-2 border border-surface-4 rounded px-2 py-1">
                          <span className="text-[10px] text-txt-secondary truncate" title={attr}>{attr}</span>
                          <span className="text-[10px] font-bold text-txt-secondary flex-shrink-0">{(w * 100).toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Panel — position nav left, archetype + tiers right */}
      <div className="rounded-xl overflow-hidden flex flex-col md:flex-row min-h-[520px] bg-surface-2 border border-surface-4">

        {/* Position Nav */}
        <div className="w-full md:w-28 bg-surface-3 border-b md:border-b-0 md:border-r border-surface-4 p-2 flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-x-visible scrollbar-none shrink-0">
          {POSITIONS.map(pos => (
            <button
              key={pos}
              onClick={() => handlePosChange(pos)}
              style={activePos === pos ? { backgroundColor: p, color: '#fff' } : undefined}
              className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-2 rounded-lg transition shrink-0 text-center ${
                activePos === pos
                  ? ''
                  : 'text-txt-tertiary hover:bg-surface-4 hover:text-txt-primary'
              }`}
            >
              {pos}
            </button>
          ))}
        </div>

        {/* Right panel */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Archetype tabs */}
          <div className="border-b border-surface-4 px-4 py-2 flex flex-wrap gap-1.5">
            {profile.archetypes.map(arch => (
              <button
                key={arch}
                onClick={() => { setActiveArch(arch); setOpenTiers(new Set()); }}
                style={activeArch === arch ? { backgroundColor: p, color: '#fff' } : undefined}
                className={`text-[10px] font-semibold px-2.5 py-1 rounded-md transition uppercase tracking-wide ${
                  activeArch === arch
                    ? ''
                    : 'text-txt-tertiary hover:text-txt-secondary hover:bg-surface-3'
                }`}
              >
                {arch}
              </button>
            ))}
          </div>

          {/* Position + archetype label, star filter, weights indicator */}
          <div className="px-5 py-3 border-b border-surface-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p className="text-[9px] font-semibold uppercase tracking-widest text-txt-tertiary">
              {activePos} · {activeArch}
              <span className="ml-2 normal-case font-normal">
                {weightsInfo.learned
                  ? `Attribute Weights: Learned · ${weightsInfo.boundariesUsed} boundar${weightsInfo.boundariesUsed !== 1 ? 'ies' : 'y'}`
                  : 'Attribute Weights: Not enough data yet'}
              </span>
            </p>
            <div className="flex gap-1">
              {STAR_TABS.map(s => (
                <button
                  key={s}
                  onClick={() => setActiveStar(s)}
                  style={activeStar === s ? { backgroundColor: p, color: '#fff' } : undefined}
                  className={`text-[10px] font-semibold px-2.5 py-1 rounded-md transition ${
                    activeStar === s
                      ? ''
                      : 'text-txt-tertiary hover:text-txt-secondary hover:bg-surface-3'
                  }`}
                >
                  {s}★
                </button>
              ))}
            </div>
          </div>

          {/* 4 Tier Cards */}
          <div className="p-4 space-y-3 flex-1">
            {(() => {
              // Tracks which attributes the nearest tier ABOVE actually used
              // for its own KEY/ALT, in order — reused as a fallback whenever
              // a tier has no direct comparison data (e.g. the tier below/
              // above it has zero revealed recruits yet), so a lone scouted
              // tier still shows real numbers instead of the generic static
              // text. Reset per render; walked top-down (Elite → Normal) since
              // that's TIER_STYLES' own order.
              let lastAttrKeys = null;
              return TIER_STYLES.map((style, i) => {
              const tier = tierData[i];
              if (!tier) return null;
              const isOpen = openTiers.has(i);
              const attrData = tierAttrStats[i];
              const ownProfile = tierProfiles[style.devTrait];
              // Normal has no tier below it, so it's measured against Impact
              // instead — phrased as falling under Impact's bar rather than
              // clearing a bar of its own.
              const isNormal = style.devTrait === 'Normal';
              const compareProfile = isNormal ? tierProfiles['Impact'] : tierProfiles[DEV_TRAITS[i + 1]];
              const direction = isNormal ? 'below' : 'above';
              let attrEntries = tierSeparationEntries(ownProfile, compareProfile, formAttrs, 4, direction);
              let renderDirection = direction;

              if (attrEntries.length === 0 && lastAttrKeys && ownProfile) {
                // No real comparison available for this tier specifically —
                // borrow the attribute selection from the nearest tier above
                // that had one, but always show THIS tier's own observed
                // average, never a borrowed number.
                attrEntries = lastAttrKeys
                  .map(attr => (ownProfile.stats[attr]?.avg != null ? [attr, 0, ownProfile.stats[attr].avg] : null))
                  .filter(Boolean);
                renderDirection = 'above';
              }
              if (attrEntries.length > 0) {
                lastAttrKeys = attrEntries.map(([attr]) => attr);
              }

              // No hand-authored fallback, ever — a tier with no real 2-sided
              // comparison data honestly says so instead of silently
              // substituting the static tier.k1/tier.k2 placeholder text.
              const dynK1 = dynamicBadgeText(ownProfile, attrEntries.slice(0, 2), renderDirection);
              const dynK2 = dynamicBadgeText(ownProfile, attrEntries.slice(2, 4), renderDirection);
              const k1 = dynK1 || 'Not enough data yet';
              const k2 = dynK2 || null;
              const badgeText = attrData.count > 0
                ? `${attrData.count} prospect${attrData.count !== 1 ? 's' : ''}`
                : 'No data yet';
              return (
                <div
                  key={i}
                  onClick={() => toggleTier(i)}
                  className={`rounded-xl border cursor-pointer transition-colors hover:bg-surface-4 ${style.border} ${style.bg} ${style.glow}`}
                >
                  <div className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className={`text-[11px] font-black uppercase tracking-wide ${style.heading}`}>{style.label}</h4>
                          <span className="text-[9px] font-semibold uppercase tracking-widest text-txt-tertiary">{badgeText}</span>
                          <span className={`ml-auto text-[8px] font-semibold uppercase px-2 py-0.5 rounded border ${
                            isOpen ? 'bg-surface-4 border-surface-5 text-txt-primary' : 'bg-surface-3 border-surface-4 text-txt-tertiary'
                          }`}>
                            {isOpen ? 'Hide' : 'Stats'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300 leading-relaxed">{tier.cond}</p>
                      </div>
                      <div className="flex sm:flex-col gap-1.5 shrink-0">
                        <div className="bg-surface-3 border border-surface-4 px-2.5 py-1 rounded-lg text-[9px] tabular-nums text-txt-secondary uppercase whitespace-nowrap">
                          <span className="text-txt-tertiary mr-1">Key:</span>{k1}
                        </div>
                        {k2 && (
                          <div className="bg-surface-3 border border-surface-4 px-2.5 py-1 rounded-lg text-[9px] tabular-nums text-txt-tertiary uppercase whitespace-nowrap">
                            <span className="text-txt-tertiary mr-1">Alt:</span>{k2}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Attribute stats — toggled by clicking the card */}
                  {isOpen && <div className="border-t border-surface-4 px-4 pb-4 pt-3">
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-txt-tertiary mb-2">
                      {attrData.count > 0 ? 'Attribute Breakdown' : 'Attribute Benchmarks'}
                      <span className="ml-2 text-txt-tertiary">
                        (<span className="text-red-500/70">min</span> · <span className="text-txt-secondary">avg</span> · <span className="text-emerald-400/70">max</span>)
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
                              <div key={attr} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg ${w > 0 ? 'bg-surface-3' : 'bg-surface-3 opacity-40'}`}>
                                <span className="text-[9px] font-semibold uppercase text-txt-secondary w-16 shrink-0 truncate">{label}</span>
                                <span className={`text-[9px] font-semibold w-6 shrink-0 ${w > 0 ? 'text-txt-tertiary' : 'text-txt-tertiary/50'}`}>
                                  {w > 0 ? `${Math.round(w * 100)}%` : '—'}
                                </span>
                                {stat ? (
                                  <div className="flex items-center gap-0.5 text-[9px] font-semibold tabular-nums">
                                    <span className="text-red-400/80">{stat.min}</span>
                                    <span className="text-slate-700 mx-0.5">/</span>
                                    <span className="text-slate-200">{stat.avg.toFixed(0)}</span>
                                    <span className="text-slate-700 mx-0.5">/</span>
                                    <span className="text-emerald-400/80">{stat.max}</span>
                                  </div>
                                ) : (
                                  <span className="text-[9px] font-semibold text-slate-600 tabular-nums">— / — / —</span>
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
              });
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
