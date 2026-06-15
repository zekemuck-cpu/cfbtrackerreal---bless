// Default situational play sheets — used when no official playbook PDF is loaded
// Organized by scheme archetype so similar schemes share a base.

// ─── Scheme → archetype maps ──────────────────────────────────────────────────

const OFF_ARCHETYPE = {
  'Spread':        'spread',
  'Spread Option': 'spread',
  'Power Spread':  'power_spread',
  'Pro Style':     'pro',
  'Multiple':      'pro',
  'Pistol':        'pistol',
  'Option':        'option',
  'Veer & Shoot':  'option',
  'Run & Shoot':   'air',
}

const DEF_ARCHETYPE = {
  '4-3':         '43',
  '4-3 Multiple':'43',
  '3-4':         '34',
  '3-4 Multiple':'34',
  '3-3-5':       'nickel',
  '3-3-5 Tite':  'nickel',
  '4-2-5':       'nickel',
  '3-2-6':       'dime',
  'Multiple D':  '43',
}

// ─── Offense archetypes ───────────────────────────────────────────────────────
// Each key is a situation: 1st | 2nd_short | 2nd_med | 2nd_long |
//                          3rd_short | 3rd_med | 3rd_long | 4th | goalline

const OFF = {
  spread: {
    '1st': [
      { name: 'Inside Zone', type: 'run' },
      { name: 'RPO Read Option', type: 'rpo' },
      { name: 'Quick Slant', type: 'pass' },
      { name: 'Outside Zone', type: 'run' },
      { name: 'Spacing', type: 'pass' },
    ],
    '2nd_short': [
      { name: 'Inside Zone', type: 'run' },
      { name: 'Read Option', type: 'run' },
      { name: 'RPO Alert Screen', type: 'rpo' },
      { name: 'Quick Hitch', type: 'pass' },
    ],
    '2nd_med': [
      { name: 'Outside Zone', type: 'run' },
      { name: 'Mesh', type: 'pass' },
      { name: 'HB Draw', type: 'run' },
      { name: 'Curls', type: 'pass' },
      { name: 'RPO Read Flat', type: 'rpo' },
    ],
    '2nd_long': [
      { name: 'Spacing', type: 'pass' },
      { name: 'Four Verticals', type: 'pass' },
      { name: 'HB Slip Screen', type: 'pass' },
      { name: 'Crossers', type: 'pass' },
    ],
    '3rd_short': [
      { name: 'QB Sneak', type: 'run' },
      { name: 'Inside Zone', type: 'run' },
      { name: 'Slant', type: 'pass' },
      { name: 'RPO Peek Slant', type: 'rpo' },
    ],
    '3rd_med': [
      { name: 'Mesh', type: 'pass' },
      { name: 'Curls', type: 'pass' },
      { name: 'PA Flood', type: 'pass' },
      { name: 'Crossers', type: 'pass' },
    ],
    '3rd_long': [
      { name: 'Four Verticals', type: 'pass' },
      { name: 'All Go', type: 'pass' },
      { name: 'Dagger', type: 'pass' },
      { name: 'HB Slip Screen', type: 'pass' },
    ],
    '4th': [
      { name: 'QB Sneak', type: 'run' },
      { name: 'Slant', type: 'pass' },
      { name: 'PA Boot', type: 'pass' },
      { name: 'Read Option', type: 'run' },
    ],
    'goalline': [
      { name: 'Power O', type: 'run' },
      { name: 'QB Sneak', type: 'run' },
      { name: 'Goal Line Fade', type: 'pass' },
      { name: 'HB Dive', type: 'run' },
    ],
  },

  power_spread: {
    '1st': [
      { name: 'Counter Y', type: 'run' },
      { name: 'Inside Zone', type: 'run' },
      { name: 'RPO Read Option', type: 'rpo' },
      { name: 'PA Flood', type: 'pass' },
      { name: 'HB Power', type: 'run' },
    ],
    '2nd_short': [
      { name: 'Power O', type: 'run' },
      { name: 'Counter', type: 'run' },
      { name: 'QB Sneak', type: 'run' },
      { name: 'RPO Alert Screen', type: 'rpo' },
    ],
    '2nd_med': [
      { name: 'Counter Y', type: 'run' },
      { name: 'Outside Zone', type: 'run' },
      { name: 'PA Cross', type: 'pass' },
      { name: 'Mesh', type: 'pass' },
    ],
    '2nd_long': [
      { name: 'PA Flood', type: 'pass' },
      { name: 'Spacing', type: 'pass' },
      { name: 'Four Verticals', type: 'pass' },
      { name: 'HB Screen', type: 'pass' },
    ],
    '3rd_short': [
      { name: 'Power O', type: 'run' },
      { name: 'QB Sneak', type: 'run' },
      { name: 'Slant', type: 'pass' },
      { name: 'Counter', type: 'run' },
    ],
    '3rd_med': [
      { name: 'PA Flood', type: 'pass' },
      { name: 'Mesh', type: 'pass' },
      { name: 'PA Deep Cross', type: 'pass' },
      { name: 'HB Draw', type: 'run' },
    ],
    '3rd_long': [
      { name: 'Four Verticals', type: 'pass' },
      { name: 'All Go', type: 'pass' },
      { name: 'Dagger', type: 'pass' },
      { name: 'HB Screen', type: 'pass' },
    ],
    '4th': [
      { name: 'Power O', type: 'run' },
      { name: 'QB Sneak', type: 'run' },
      { name: 'PA Boot', type: 'pass' },
    ],
    'goalline': [
      { name: 'Power O', type: 'run' },
      { name: 'HB Dive', type: 'run' },
      { name: 'Counter', type: 'run' },
      { name: 'Goal Line Fade', type: 'pass' },
    ],
  },

  pro: {
    '1st': [
      { name: 'HB Power O', type: 'run' },
      { name: 'Inside Zone', type: 'run' },
      { name: 'PA Counter Waggle', type: 'pass' },
      { name: 'HB Lead Toss', type: 'run' },
      { name: 'Play Action Cross', type: 'pass' },
    ],
    '2nd_short': [
      { name: 'HB Dive', type: 'run' },
      { name: 'Power O', type: 'run' },
      { name: 'FB Dive', type: 'run' },
      { name: 'Quick Slant', type: 'pass' },
    ],
    '2nd_med': [
      { name: 'Counter', type: 'run' },
      { name: 'HB ISO', type: 'run' },
      { name: 'PA Cross', type: 'pass' },
      { name: 'Curl Flat', type: 'pass' },
    ],
    '2nd_long': [
      { name: 'PA Bootleg', type: 'pass' },
      { name: 'Four Verticals', type: 'pass' },
      { name: 'Crossing Routes', type: 'pass' },
      { name: 'HB Screen', type: 'pass' },
    ],
    '3rd_short': [
      { name: 'FB Dive', type: 'run' },
      { name: 'HB ISO', type: 'run' },
      { name: 'Quick Out', type: 'pass' },
      { name: 'PA Boot', type: 'pass' },
    ],
    '3rd_med': [
      { name: 'PA Deep Cross', type: 'pass' },
      { name: 'Mesh', type: 'pass' },
      { name: 'PA Flood', type: 'pass' },
      { name: 'Curl Flat', type: 'pass' },
    ],
    '3rd_long': [
      { name: 'Four Verticals', type: 'pass' },
      { name: 'Dagger', type: 'pass' },
      { name: 'All Go', type: 'pass' },
      { name: 'HB Screen', type: 'pass' },
    ],
    '4th': [
      { name: 'HB Power O', type: 'run' },
      { name: 'PA Boot', type: 'pass' },
      { name: 'Quick Slant', type: 'pass' },
    ],
    'goalline': [
      { name: 'FB Dive', type: 'run' },
      { name: 'Power O', type: 'run' },
      { name: 'PA Corner', type: 'pass' },
      { name: 'HB Counter', type: 'run' },
    ],
  },

  pistol: {
    '1st': [
      { name: 'HB Stretch', type: 'run' },
      { name: 'Wide Zone', type: 'run' },
      { name: 'PA Boot Slide', type: 'pass' },
      { name: 'Read Option', type: 'run' },
      { name: 'RPO Zone X Glance', type: 'rpo' },
    ],
    '2nd_short': [
      { name: 'HB Dive', type: 'run' },
      { name: 'Counter Y', type: 'run' },
      { name: 'Read Option', type: 'run' },
      { name: 'Stick', type: 'pass' },
    ],
    '2nd_med': [
      { name: 'Wide Zone', type: 'run' },
      { name: 'PA Stretch Shot', type: 'pass' },
      { name: 'Counter Y', type: 'run' },
      { name: 'Curls', type: 'pass' },
    ],
    '2nd_long': [
      { name: 'Dash Flood', type: 'pass' },
      { name: 'Four Verticals', type: 'pass' },
      { name: 'PA Boot Slide', type: 'pass' },
      { name: 'HB Screen', type: 'pass' },
    ],
    '3rd_short': [
      { name: 'HB Dive', type: 'run' },
      { name: 'Y Lead Read Option', type: 'run' },
      { name: 'Stick', type: 'pass' },
      { name: 'Counter Y', type: 'run' },
    ],
    '3rd_med': [
      { name: 'Curls', type: 'pass' },
      { name: 'PA Double Post', type: 'pass' },
      { name: 'Vertical TE Cross', type: 'pass' },
      { name: 'Dash Flood', type: 'pass' },
    ],
    '3rd_long': [
      { name: 'All Go', type: 'pass' },
      { name: 'PA Stretch Shot', type: 'pass' },
      { name: 'Four Verticals', type: 'pass' },
      { name: 'HB Screen', type: 'pass' },
    ],
    '4th': [
      { name: 'Y Lead Read Option', type: 'run' },
      { name: 'HB Dive', type: 'run' },
      { name: 'Stick', type: 'pass' },
    ],
    'goalline': [
      { name: 'HB Dive', type: 'run' },
      { name: 'Power O', type: 'run' },
      { name: 'PA TE Corner', type: 'pass' },
      { name: 'Counter Lead', type: 'run' },
    ],
  },

  option: {
    '1st': [
      { name: 'Triple Option', type: 'run' },
      { name: 'Inside Zone', type: 'run' },
      { name: 'Midline Option', type: 'run' },
      { name: 'HB Dive', type: 'run' },
      { name: 'Outside Veer', type: 'run' },
    ],
    '2nd_short': [
      { name: 'Triple Option', type: 'run' },
      { name: 'QB Keeper', type: 'run' },
      { name: 'Pitch Option', type: 'run' },
      { name: 'HB Dive', type: 'run' },
    ],
    '2nd_med': [
      { name: 'Outside Veer', type: 'run' },
      { name: 'Triple Option', type: 'run' },
      { name: 'PA Cross', type: 'pass' },
      { name: 'Zone Read', type: 'run' },
    ],
    '2nd_long': [
      { name: 'PA Flood', type: 'pass' },
      { name: 'PA Boot', type: 'pass' },
      { name: 'Option Pass', type: 'pass' },
      { name: 'HB Screen', type: 'pass' },
    ],
    '3rd_short': [
      { name: 'QB Keeper', type: 'run' },
      { name: 'Triple Option', type: 'run' },
      { name: 'Quick Out', type: 'pass' },
      { name: 'Inside Zone', type: 'run' },
    ],
    '3rd_med': [
      { name: 'Option Pass', type: 'pass' },
      { name: 'PA Boot', type: 'pass' },
      { name: 'Zone Read', type: 'run' },
      { name: 'Crossing Routes', type: 'pass' },
    ],
    '3rd_long': [
      { name: 'PA Deep Cross', type: 'pass' },
      { name: 'Four Verticals', type: 'pass' },
      { name: 'HB Screen', type: 'pass' },
      { name: 'PA Boot', type: 'pass' },
    ],
    '4th': [
      { name: 'QB Sneak', type: 'run' },
      { name: 'Triple Option', type: 'run' },
      { name: 'PA Boot', type: 'pass' },
    ],
    'goalline': [
      { name: 'QB Sneak', type: 'run' },
      { name: 'Full House Dive', type: 'run' },
      { name: 'Power', type: 'run' },
      { name: 'Goal Line Fade', type: 'pass' },
    ],
  },

  air: {
    '1st': [
      { name: 'Quick Out', type: 'pass' },
      { name: 'Spacing', type: 'pass' },
      { name: 'Bubble Screen', type: 'pass' },
      { name: 'HB Draw', type: 'run' },
      { name: 'Slant', type: 'pass' },
    ],
    '2nd_short': [
      { name: 'Quick Hitch', type: 'pass' },
      { name: 'Bubble Screen', type: 'pass' },
      { name: 'HB Draw', type: 'run' },
      { name: 'Quick Slant', type: 'pass' },
    ],
    '2nd_med': [
      { name: 'Curls', type: 'pass' },
      { name: 'Crossing Routes', type: 'pass' },
      { name: 'Mesh', type: 'pass' },
      { name: 'WR Screen', type: 'pass' },
    ],
    '2nd_long': [
      { name: 'Four Verticals', type: 'pass' },
      { name: 'Mesh', type: 'pass' },
      { name: 'Dig Routes', type: 'pass' },
      { name: 'WR Screen', type: 'pass' },
    ],
    '3rd_short': [
      { name: 'Quick Slant', type: 'pass' },
      { name: 'Bubble Screen', type: 'pass' },
      { name: 'HB Draw', type: 'run' },
      { name: 'Quick Out', type: 'pass' },
    ],
    '3rd_med': [
      { name: 'Curls', type: 'pass' },
      { name: 'Crossing Routes', type: 'pass' },
      { name: 'Spacing', type: 'pass' },
      { name: 'Dig Routes', type: 'pass' },
    ],
    '3rd_long': [
      { name: 'Four Verticals', type: 'pass' },
      { name: 'Dagger', type: 'pass' },
      { name: 'WR Screen', type: 'pass' },
      { name: 'All Go', type: 'pass' },
    ],
    '4th': [
      { name: 'Quick Slant', type: 'pass' },
      { name: 'Spacing', type: 'pass' },
      { name: 'HB Draw', type: 'run' },
    ],
    'goalline': [
      { name: 'Quick Fade', type: 'pass' },
      { name: 'HB Draw', type: 'run' },
      { name: 'Slant', type: 'pass' },
      { name: 'Short Out', type: 'pass' },
    ],
  },
}

// ─── Defense archetypes ───────────────────────────────────────────────────────
// type: 'base' | 'coverage' | 'blitz' | 'package'
// 'goalline' situation = opp inside your 5

const DEF = {
  '43': {
    '1st': [
      { name: '4-3 Under', type: 'base' },
      { name: '4-3 Over', type: 'base' },
      { name: 'Cover 2', type: 'coverage' },
      { name: 'Cover 3 Sky', type: 'coverage' },
    ],
    '2nd_short': [
      { name: '4-3 Pinch', type: 'base' },
      { name: 'Cover 2', type: 'coverage' },
      { name: 'SS Blitz', type: 'blitz' },
      { name: 'Cover 1 Man', type: 'coverage' },
    ],
    '2nd_med': [
      { name: '4-3 Over', type: 'base' },
      { name: 'Tampa 2', type: 'coverage' },
      { name: 'Cover 3 Drop', type: 'coverage' },
      { name: 'CB Blitz', type: 'blitz' },
    ],
    '2nd_long': [
      { name: 'Nickel Normal', type: 'package' },
      { name: 'Cover 2', type: 'coverage' },
      { name: 'Cover 3 Drop', type: 'coverage' },
      { name: 'Fire Zone', type: 'blitz' },
    ],
    '3rd_short': [
      { name: '4-3 Pinch', type: 'base' },
      { name: 'MLB Blitz', type: 'blitz' },
      { name: 'Cover 1 Man', type: 'coverage' },
      { name: 'SS Blitz', type: 'blitz' },
    ],
    '3rd_med': [
      { name: 'Nickel Normal', type: 'package' },
      { name: 'Tampa 2', type: 'coverage' },
      { name: 'Cover 3 Drop', type: 'coverage' },
      { name: 'Zone Blitz', type: 'blitz' },
    ],
    '3rd_long': [
      { name: 'Dime Normal', type: 'package' },
      { name: 'Cover 2', type: 'coverage' },
      { name: 'Cover 4', type: 'coverage' },
      { name: 'CB Blitz', type: 'blitz' },
    ],
    '4th': [
      { name: '4-3 Pinch', type: 'base' },
      { name: 'MLB Blitz', type: 'blitz' },
      { name: 'Cover 1 Man', type: 'coverage' },
    ],
    'goalline': [
      { name: 'Goal Line 5-4', type: 'base' },
      { name: 'Goal Line Man', type: 'coverage' },
      { name: 'QB Contain', type: 'blitz' },
      { name: 'Safety Blitz', type: 'blitz' },
    ],
  },

  '34': {
    '1st': [
      { name: '3-4 Solid', type: 'base' },
      { name: '3-4 Over', type: 'base' },
      { name: 'Cover 2', type: 'coverage' },
      { name: 'Cover 3 Drop', type: 'coverage' },
    ],
    '2nd_short': [
      { name: '3-4 Bear', type: 'base' },
      { name: 'OLB Blitz', type: 'blitz' },
      { name: 'Cover 2', type: 'coverage' },
      { name: '3-4 Pinch', type: 'base' },
    ],
    '2nd_med': [
      { name: '3-4 Solid', type: 'base' },
      { name: 'Cover 3 Drop', type: 'coverage' },
      { name: 'Tampa 2', type: 'coverage' },
      { name: 'Zone Dog', type: 'blitz' },
    ],
    '2nd_long': [
      { name: 'Nickel Normal', type: 'package' },
      { name: 'Cover 2', type: 'coverage' },
      { name: 'Cover 3 Drop', type: 'coverage' },
      { name: 'OLB Blitz', type: 'blitz' },
    ],
    '3rd_short': [
      { name: '3-4 Bear', type: 'base' },
      { name: 'ILB Blitz', type: 'blitz' },
      { name: 'Cover 1 Man', type: 'coverage' },
      { name: '3-4 Pinch', type: 'base' },
    ],
    '3rd_med': [
      { name: 'Nickel Normal', type: 'package' },
      { name: 'Tampa 2', type: 'coverage' },
      { name: 'Cover 3 Drop', type: 'coverage' },
      { name: 'Zone Dog', type: 'blitz' },
    ],
    '3rd_long': [
      { name: 'Dime Normal', type: 'package' },
      { name: 'Cover 2', type: 'coverage' },
      { name: 'Cover 4', type: 'coverage' },
      { name: 'OLB Blitz', type: 'blitz' },
    ],
    '4th': [
      { name: '3-4 Bear', type: 'base' },
      { name: 'ILB Blitz', type: 'blitz' },
      { name: 'Cover 1 Man', type: 'coverage' },
    ],
    'goalline': [
      { name: 'Goal Line 5-4', type: 'base' },
      { name: 'Goal Line Man', type: 'coverage' },
      { name: 'Safety Blitz', type: 'blitz' },
      { name: 'OLB Contain', type: 'blitz' },
    ],
  },

  nickel: {
    '1st': [
      { name: 'Nickel Normal', type: 'package' },
      { name: '4-3 Under', type: 'base' },
      { name: 'Cover 3 Drop', type: 'coverage' },
      { name: 'Cover 2', type: 'coverage' },
    ],
    '2nd_short': [
      { name: '4-3 Pinch', type: 'base' },
      { name: 'Nickel Normal', type: 'package' },
      { name: 'SS Blitz', type: 'blitz' },
      { name: 'Cover 1 Man', type: 'coverage' },
    ],
    '2nd_med': [
      { name: 'Nickel Normal', type: 'package' },
      { name: 'Tampa 2', type: 'coverage' },
      { name: 'Cover 3 Drop', type: 'coverage' },
      { name: 'Double A Gap', type: 'blitz' },
    ],
    '2nd_long': [
      { name: 'Nickel 3-3-5', type: 'package' },
      { name: 'Cover 2', type: 'coverage' },
      { name: 'Fire Zone', type: 'blitz' },
      { name: 'Cover 4', type: 'coverage' },
    ],
    '3rd_short': [
      { name: '4-3 Pinch', type: 'base' },
      { name: 'Double A Gap', type: 'blitz' },
      { name: 'Cover 1 Man', type: 'coverage' },
      { name: 'Safety Blitz', type: 'blitz' },
    ],
    '3rd_med': [
      { name: 'Nickel 3-3-5', type: 'package' },
      { name: 'Tampa 2', type: 'coverage' },
      { name: 'Cover 3 Drop', type: 'coverage' },
      { name: 'Fire Zone', type: 'blitz' },
    ],
    '3rd_long': [
      { name: 'Dime Normal', type: 'package' },
      { name: 'Cover 2', type: 'coverage' },
      { name: 'Cover 4', type: 'coverage' },
      { name: 'CB Blitz', type: 'blitz' },
    ],
    '4th': [
      { name: 'Nickel Normal', type: 'package' },
      { name: 'Double A Gap', type: 'blitz' },
      { name: 'Cover 1 Man', type: 'coverage' },
    ],
    'goalline': [
      { name: 'Goal Line 5-4', type: 'base' },
      { name: 'Goal Line Man', type: 'coverage' },
      { name: 'Safety Blitz', type: 'blitz' },
    ],
  },

  dime: {
    '1st': [
      { name: 'Nickel Normal', type: 'package' },
      { name: 'Cover 3 Drop', type: 'coverage' },
      { name: 'Cover 2', type: 'coverage' },
      { name: '4-3 Under', type: 'base' },
    ],
    '2nd_short': [
      { name: 'Nickel Normal', type: 'package' },
      { name: 'Cover 1 Man', type: 'coverage' },
      { name: 'Double A Gap', type: 'blitz' },
      { name: '4-3 Pinch', type: 'base' },
    ],
    '2nd_med': [
      { name: 'Dime Normal', type: 'package' },
      { name: 'Tampa 2', type: 'coverage' },
      { name: 'Robber', type: 'coverage' },
      { name: 'Cover 3 Drop', type: 'coverage' },
    ],
    '2nd_long': [
      { name: 'Dime 3-2-6', type: 'package' },
      { name: 'Cover 2', type: 'coverage' },
      { name: 'Cover 2 Sink', type: 'coverage' },
      { name: 'Fire Zone', type: 'blitz' },
    ],
    '3rd_short': [
      { name: 'Nickel Normal', type: 'package' },
      { name: 'Double A Gap', type: 'blitz' },
      { name: 'Cover 1 Man', type: 'coverage' },
    ],
    '3rd_med': [
      { name: 'Dime Normal', type: 'package' },
      { name: 'Tampa 2', type: 'coverage' },
      { name: 'Robber', type: 'coverage' },
      { name: 'Man Blitz', type: 'blitz' },
    ],
    '3rd_long': [
      { name: 'Dime 3-2-6', type: 'package' },
      { name: 'Cover 2 Sink', type: 'coverage' },
      { name: 'Cover 4', type: 'coverage' },
      { name: 'Fire Zone', type: 'blitz' },
    ],
    '4th': [
      { name: 'Dime Normal', type: 'package' },
      { name: 'Cover 1 Man', type: 'coverage' },
      { name: 'Man Blitz', type: 'blitz' },
    ],
    'goalline': [
      { name: 'Goal Line 5-4', type: 'base' },
      { name: 'Goal Line Man', type: 'coverage' },
      { name: 'Safety Blitz', type: 'blitz' },
    ],
  },
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getOffenseDefaultPlays(scheme, situation) {
  const archetype = OFF_ARCHETYPE[scheme] || 'spread'
  return (OFF[archetype]?.[situation] ?? OFF[archetype]?.['1st'] ?? [])
}

export function getDefenseDefaultPlays(scheme, situation) {
  const archetype = DEF_ARCHETYPE[scheme] || '43'
  return (DEF[archetype]?.[situation] ?? DEF[archetype]?.['1st'] ?? [])
}

// All situations in display order
export const OFFENSE_SITUATIONS = [
  { value: '1st',      label: '1st Down' },
  { value: '2nd_short',label: '2nd & Short (1-4)' },
  { value: '2nd_med',  label: '2nd & Medium (5-7)' },
  { value: '2nd_long', label: '2nd & Long (8+)' },
  { value: '3rd_short',label: '3rd & Short (1-3)' },
  { value: '3rd_med',  label: '3rd & Medium (4-6)' },
  { value: '3rd_long', label: '3rd & Long (7+)' },
  { value: '4th',      label: '4th Down' },
  { value: 'goalline', label: 'Goal Line' },
]

export const DEFENSE_SITUATIONS = [
  { value: '1st',      label: 'Opp 1st Down' },
  { value: '2nd_short',label: 'Opp 2nd & Short' },
  { value: '2nd_med',  label: 'Opp 2nd & Medium' },
  { value: '2nd_long', label: 'Opp 2nd & Long' },
  { value: '3rd_short',label: 'Opp 3rd & Short' },
  { value: '3rd_med',  label: 'Opp 3rd & Medium' },
  { value: '3rd_long', label: 'Opp 3rd & Long' },
  { value: '4th',      label: 'Opp 4th Down' },
  { value: 'goalline', label: 'Goal Line (Opp)' },
]

// Defense type colors (base/coverage/blitz/package for default plays; man/zone/match/blitz for official playbooks)
export const DEF_TYPE_COLORS = {
  base:     '#fb923c',  // orange-400
  blitz:    '#f87171',  // red-400
  coverage: '#38bdf8',  // sky-400
  zone:     '#38bdf8',  // sky-400
  man:      '#fb7185',  // rose-400
  match:    '#a78bfa',  // violet-400
  package:  '#facc15',  // yellow-400
}
