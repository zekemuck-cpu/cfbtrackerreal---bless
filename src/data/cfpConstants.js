// CFP Game Slot IDs and Mappings
// Each CFP game has a fixed slot ID that never changes

// All 6 NY6 bowls that rotate between QF and SF hosting
export const CFP_NY6_BOWLS = ['Sugar Bowl', 'Orange Bowl', 'Rose Bowl', 'Cotton Bowl', 'Peach Bowl', 'Fiesta Bowl']

// Default seed-based bowl mapping (used when no config is provided)
// Maps each bye seed's QF game to a bowl name
// In real CFP, these assignments rotate each year
export const DEFAULT_BOWL_CONFIG = {
  seed1: 'Sugar Bowl',    // Bowl for #1 seed's QF game
  seed2: 'Cotton Bowl',   // Bowl for #2 seed's QF game
  seed3: 'Rose Bowl',     // Bowl for #3 seed's QF game
  seed4: 'Orange Bowl',   // Bowl for #4 seed's QF game
  sf1: 'Peach Bowl',      // SF1 (1/4 bracket side)
  sf2: 'Fiesta Bowl'      // SF2 (2/3 bracket side)
}

// Bracket position descriptions for UI (by seed)
export const SEED_DESCRIPTIONS = {
  seed1: '#1 seed vs 8/9 winner',
  seed2: '#2 seed vs 7/10 winner',
  seed3: '#3 seed vs 6/11 winner',
  seed4: '#4 seed vs 5/12 winner',
  sf1: 'SF1: 1/4 bracket winners',
  sf2: 'SF2: 2/3 bracket winners'
}

// Map bye seed to slot ID
export const SEED_TO_SLOT = {
  1: 'cfpqf1',
  2: 'cfpqf4',
  3: 'cfpqf3',
  4: 'cfpqf2'
}

// Get bowl name for a bye seed from configuration
export function getBowlForSeed(byeSeed, bowlConfig = DEFAULT_BOWL_CONFIG) {
  const key = `seed${byeSeed}`
  return bowlConfig?.[key] || DEFAULT_BOWL_CONFIG[key] || null
}

// Get bowl name for a slot from configuration (maps slot to seed first)
export function getBowlForSlot(slotId, bowlConfig = DEFAULT_BOWL_CONFIG) {
  // For semifinals, use sf1/sf2 keys directly
  if (slotId === 'cfpsf1') return bowlConfig?.sf1 || DEFAULT_BOWL_CONFIG.sf1
  if (slotId === 'cfpsf2') return bowlConfig?.sf2 || DEFAULT_BOWL_CONFIG.sf2

  // For quarterfinals, map slot to seed
  const slotToSeed = { cfpqf1: 1, cfpqf2: 4, cfpqf3: 3, cfpqf4: 2 }
  const seed = slotToSeed[slotId]
  if (seed) return getBowlForSeed(seed, bowlConfig)

  return null
}

// Comprehensive bracket configuration for game shell system
// This defines the complete bracket structure with propagation relationships
export const CFP_BRACKET_SLOTS = {
  // First Round - seeds 5-12 play, on-campus games
  cfpfr1: {
    round: 'first_round',
    week: 1,
    higherSeed: 5,
    lowerSeed: 12,
    feedsInto: 'cfpqf2',
    name: 'First Round - 5 vs 12'
  },
  cfpfr2: {
    round: 'first_round',
    week: 1,
    higherSeed: 8,
    lowerSeed: 9,
    feedsInto: 'cfpqf1',
    name: 'First Round - 8 vs 9'
  },
  cfpfr3: {
    round: 'first_round',
    week: 1,
    higherSeed: 6,
    lowerSeed: 11,
    feedsInto: 'cfpqf3',
    name: 'First Round - 6 vs 11'
  },
  cfpfr4: {
    round: 'first_round',
    week: 1,
    higherSeed: 7,
    lowerSeed: 10,
    feedsInto: 'cfpqf4',
    name: 'First Round - 7 vs 10'
  },

  // Quarterfinals - top 4 seeds get bye, play first round winners
  cfpqf1: {
    round: 'quarterfinal',
    week: 2,
    byeSeed: 1,
    feedsFrom: 'cfpfr2',  // Winner of 8v9
    feedsInto: 'cfpsf1',
    bowl: 'Sugar Bowl',
    name: 'Sugar Bowl (CFP Quarterfinal)'
  },
  cfpqf2: {
    round: 'quarterfinal',
    week: 2,
    byeSeed: 4,
    feedsFrom: 'cfpfr1',  // Winner of 5v12
    feedsInto: 'cfpsf1',
    bowl: 'Orange Bowl',
    name: 'Orange Bowl (CFP Quarterfinal)'
  },
  cfpqf3: {
    round: 'quarterfinal',
    week: 2,
    byeSeed: 3,
    feedsFrom: 'cfpfr3',  // Winner of 6v11
    feedsInto: 'cfpsf2',
    bowl: 'Rose Bowl',
    name: 'Rose Bowl (CFP Quarterfinal)'
  },
  cfpqf4: {
    round: 'quarterfinal',
    week: 2,
    byeSeed: 2,
    feedsFrom: 'cfpfr4',  // Winner of 7v10
    feedsInto: 'cfpsf2',
    bowl: 'Cotton Bowl',
    name: 'Cotton Bowl (CFP Quarterfinal)'
  },

  // Semifinals
  cfpsf1: {
    round: 'semifinal',
    week: 3,
    feedsFrom: ['cfpqf1', 'cfpqf2'],  // Sugar vs Orange winners
    feedsInto: 'cfpnc',
    bowl: 'Peach Bowl',
    name: 'Peach Bowl (CFP Semifinal)'
  },
  cfpsf2: {
    round: 'semifinal',
    week: 3,
    feedsFrom: ['cfpqf3', 'cfpqf4'],  // Rose vs Cotton winners
    feedsInto: 'cfpnc',
    bowl: 'Fiesta Bowl',
    name: 'Fiesta Bowl (CFP Semifinal)'
  },

  // Championship
  cfpnc: {
    round: 'championship',
    week: 4,
    feedsFrom: ['cfpsf1', 'cfpsf2'],
    bowl: 'National Championship',
    name: 'National Championship'
  }
}

// First Round matchups (seeds)
export const CFP_FIRST_ROUND_SLOTS = {
  cfpfr1: { seed1: 5, seed2: 12, name: 'First Round - 5 vs 12' },
  cfpfr2: { seed1: 8, seed2: 9, name: 'First Round - 8 vs 9' },
  cfpfr3: { seed1: 6, seed2: 11, name: 'First Round - 6 vs 11' },
  cfpfr4: { seed1: 7, seed2: 10, name: 'First Round - 7 vs 10' }
}

// Quarterfinal bowl mappings
export const CFP_QUARTERFINAL_SLOTS = {
  cfpqf1: { bowlName: 'Sugar Bowl', hostSeed: 1, name: 'Sugar Bowl (CFP Quarterfinal)' },
  cfpqf2: { bowlName: 'Orange Bowl', hostSeed: 4, name: 'Orange Bowl (CFP Quarterfinal)' },
  cfpqf3: { bowlName: 'Rose Bowl', hostSeed: 3, name: 'Rose Bowl (CFP Quarterfinal)' },
  cfpqf4: { bowlName: 'Cotton Bowl', hostSeed: 2, name: 'Cotton Bowl (CFP Quarterfinal)' }
}

// Semifinal bowl mappings
export const CFP_SEMIFINAL_SLOTS = {
  cfpsf1: { bowlName: 'Peach Bowl', name: 'Peach Bowl (CFP Semifinal)' },
  cfpsf2: { bowlName: 'Fiesta Bowl', name: 'Fiesta Bowl (CFP Semifinal)' }
}

// Championship
export const CFP_CHAMPIONSHIP_SLOT = {
  cfpnc: { bowlName: 'National Championship', name: 'National Championship' }
}

// All slots combined for easy lookup
export const ALL_CFP_SLOTS = {
  ...CFP_FIRST_ROUND_SLOTS,
  ...CFP_QUARTERFINAL_SLOTS,
  ...CFP_SEMIFINAL_SLOTS,
  ...CFP_CHAMPIONSHIP_SLOT
}

// Helper: Get slot ID from bowl name
export function getSlotIdFromBowlName(bowlName) {
  const bowlToSlot = {
    'Sugar Bowl': 'cfpqf1',
    'Orange Bowl': 'cfpqf2',
    'Rose Bowl': 'cfpqf3',
    'Cotton Bowl': 'cfpqf4',
    'Peach Bowl': 'cfpsf1',
    'Fiesta Bowl': 'cfpsf2',
    'National Championship': 'cfpnc'
  }
  return bowlToSlot[bowlName] || null
}

// Helper: Get bowl name from slot ID
export function getBowlNameFromSlotId(slotId) {
  const slot = ALL_CFP_SLOTS[slotId]
  return slot?.bowlName || null
}

// Helper: Get slot ID from first round seeds
export function getFirstRoundSlotId(seed1, seed2) {
  const seedPairs = {
    '5-12': 'cfpfr1',
    '12-5': 'cfpfr1',
    '8-9': 'cfpfr2',
    '9-8': 'cfpfr2',
    '6-11': 'cfpfr3',
    '11-6': 'cfpfr3',
    '7-10': 'cfpfr4',
    '10-7': 'cfpfr4'
  }
  return seedPairs[`${seed1}-${seed2}`] || null
}

// Helper: Generate full game ID with year
export function getCFPGameId(slotId, year) {
  return `${slotId}-${year}`
}

// Helper: Parse game ID to get slot and year
export function parseCFPGameId(gameId) {
  const match = gameId.match(/^(cfp(?:fr|qf|sf|nc)\d?)-(\d+)$/)
  if (match) {
    return { slotId: match[1], year: parseInt(match[2]) }
  }
  return null
}

// Helper: Check if a game ID is a CFP game
export function isCFPGameId(gameId) {
  return /^cfp(?:fr|qf|sf|nc)\d?-\d+$/.test(gameId)
}

// Helper: Get display name for a CFP slot
export function getCFPSlotDisplayName(slotId) {
  const displayNames = {
    cfpfr1: 'CFP First Round',
    cfpfr2: 'CFP First Round',
    cfpfr3: 'CFP First Round',
    cfpfr4: 'CFP First Round',
    cfpqf1: 'Sugar Bowl',
    cfpqf2: 'Orange Bowl',
    cfpqf3: 'Rose Bowl',
    cfpqf4: 'Cotton Bowl',
    cfpsf1: 'Peach Bowl',
    cfpsf2: 'Fiesta Bowl',
    cfpnc: 'National Championship'
  }
  return displayNames[slotId] || slotId
}

// Helper: Get round info for a slot
export function getCFPRoundInfo(slotId) {
  if (slotId.startsWith('cfpfr')) {
    return { round: 1, roundName: 'First Round', isCFPFirstRound: true }
  }
  if (slotId.startsWith('cfpqf')) {
    return { round: 2, roundName: 'Quarterfinal', isCFPQuarterfinal: true }
  }
  if (slotId.startsWith('cfpsf')) {
    return { round: 3, roundName: 'Semifinal', isCFPSemifinal: true }
  }
  if (slotId === 'cfpnc') {
    return { round: 4, roundName: 'Championship', isCFPChampionship: true }
  }
  return null
}

// Ordered arrays for iteration
export const CFP_FIRST_ROUND_ORDER = ['cfpfr1', 'cfpfr2', 'cfpfr3', 'cfpfr4']
export const CFP_QUARTERFINAL_ORDER = ['cfpqf1', 'cfpqf2', 'cfpqf3', 'cfpqf4']
export const CFP_SEMIFINAL_ORDER = ['cfpsf1', 'cfpsf2']
export const CFP_ALL_SLOTS_ORDER = [
  ...CFP_FIRST_ROUND_ORDER,
  ...CFP_QUARTERFINAL_ORDER,
  ...CFP_SEMIFINAL_ORDER,
  'cfpnc'
]

// ============================================================
// BULLETPROOF BRACKET FLOW - SINGLE SOURCE OF TRUTH
// ============================================================
// This defines EXACTLY how winners flow through the bracket.
// cfpSlot is the ONLY identifier for bracket position.
// Bowl names are display-only metadata.

export const CFP_BRACKET_FLOW = {
  // First Round: winners feed into QF team2 positions
  // (QF team1 is always the bye seed)
  firstRound: {
    cfpfr1: { higherSeed: 5, lowerSeed: 12, feedsInto: 'cfpqf2', feedsPosition: 'team2' },
    cfpfr2: { higherSeed: 8, lowerSeed: 9, feedsInto: 'cfpqf1', feedsPosition: 'team2' },
    cfpfr3: { higherSeed: 6, lowerSeed: 11, feedsInto: 'cfpqf3', feedsPosition: 'team2' },
    cfpfr4: { higherSeed: 7, lowerSeed: 10, feedsInto: 'cfpqf4', feedsPosition: 'team2' },
  },

  // Quarterfinals: bye seed in team1, FR winner in team2
  // Winners feed into SF at specified positions
  quarterfinals: {
    cfpqf1: { byeSeed: 1, feedsInto: 'cfpsf1', feedsPosition: 'team1' },  // Seed 1 winner → SF1 team1
    cfpqf2: { byeSeed: 4, feedsInto: 'cfpsf1', feedsPosition: 'team2' },  // Seed 4 winner → SF1 team2
    cfpqf3: { byeSeed: 3, feedsInto: 'cfpsf2', feedsPosition: 'team1' },  // Seed 3 winner → SF2 team1
    cfpqf4: { byeSeed: 2, feedsInto: 'cfpsf2', feedsPosition: 'team2' },  // Seed 2 winner → SF2 team2
  },

  // Semifinals: QF winners feed in, winners go to NC
  semifinals: {
    cfpsf1: { feedsFrom: ['cfpqf1', 'cfpqf2'], feedsInto: 'cfpnc', feedsPosition: 'team1' },  // 1/4 bracket → NC team1
    cfpsf2: { feedsFrom: ['cfpqf3', 'cfpqf4'], feedsInto: 'cfpnc', feedsPosition: 'team2' },  // 2/3 bracket → NC team2
  },

  // Championship: SF winners
  championship: {
    cfpnc: { feedsFrom: ['cfpsf1', 'cfpsf2'], feedsInto: null, feedsPosition: null }
  }
}

// Visual bracket display order (top to bottom on bracket view)
export const BRACKET_DISPLAY_ORDER = {
  firstRound: ['cfpfr1', 'cfpfr2', 'cfpfr3', 'cfpfr4'],  // 5v12, 8v9, 6v11, 7v10
  quarterfinals: ['cfpqf2', 'cfpqf1', 'cfpqf3', 'cfpqf4'],  // Seed 4, 1, 3, 2 (visual order)
  semifinals: ['cfpsf1', 'cfpsf2'],
  championship: ['cfpnc']
}

// Get the bracket flow config for any slot
export function getBracketFlowConfig(slotId) {
  return CFP_BRACKET_FLOW.firstRound[slotId] ||
         CFP_BRACKET_FLOW.quarterfinals[slotId] ||
         CFP_BRACKET_FLOW.semifinals[slotId] ||
         CFP_BRACKET_FLOW.championship[slotId] ||
         null
}
