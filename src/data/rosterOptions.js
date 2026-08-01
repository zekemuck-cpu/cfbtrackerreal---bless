// Allowed dropdown values for roster entry columns. These mirror the literal
// value lists in the roster AI prompt (RosterEntryModal / RosterEditModal), so
// the in-app dropdowns match exactly what the game/sheet accept. Kept here as a
// single source the grid dropdowns read from.

export const POSITIONS = [
  'QB', 'HB', 'FB', 'WR', 'TE',
  'LT', 'LG', 'C', 'RG', 'RT',
  'LEDG', 'REDG', 'DT',
  'SAM', 'MIKE', 'WILL',
  'CB', 'FS', 'SS',
  'K', 'P',
]

export const CLASSES = ['Fr', 'RS Fr', 'So', 'RS So', 'Jr', 'RS Jr', 'Sr', 'RS Sr']

export const DEV_TRAITS = ['Normal', 'Impact', 'Star', 'Elite']

// Archetypes per position group (CFB 26). OL/DL/LB/S positions share a group.
const ARCH = {
  QB: ['Backfield Creator', 'Dual Threat', 'Pocket Passer', 'Pure Runner'],
  HB: ['Backfield Threat', 'Contact Seeker', 'East/West Playmaker', 'Elusive Bruiser', 'North/South Receiver', 'North/South Blocker'],
  FB: ['Blocking', 'Utility'],
  WR: ['Contested Specialist', 'Elusive Route Runner', 'Gadget', 'Gritty Possession', 'Physical Route Runner', 'Route Artist', 'Speedster'],
  TE: ['Possession', 'Pure Blocker', 'Pure Possession', 'Vertical Threat'],
  OL: ['Agile', 'Pass Protector', 'Raw Strength', 'Ground and Pound', 'Well Rounded'],
  DL: ['Edge Setter', 'Gap Specialist', 'Power Rusher', 'Pure Power', 'Speed Rusher'],
  LB: ['Lurker', 'Signal Caller', 'Thumper'],
  CB: ['Boundary', 'Bump and Run', 'Field', 'Zone'],
  S: ['Box Specialist', 'Coverage Specialist', 'Hybrid'],
  KP: ['Accurate', 'Power'],
}

// Map each position code to its archetype group.
export const ARCHETYPES_BY_POSITION = {
  QB: ARCH.QB, HB: ARCH.HB, FB: ARCH.FB, WR: ARCH.WR, TE: ARCH.TE,
  LT: ARCH.OL, LG: ARCH.OL, C: ARCH.OL, RG: ARCH.OL, RT: ARCH.OL,
  LEDG: ARCH.DL, REDG: ARCH.DL, DT: ARCH.DL,
  SAM: ARCH.LB, MIKE: ARCH.LB, WILL: ARCH.LB,
  CB: ARCH.CB, FS: ARCH.S, SS: ARCH.S,
  K: ARCH.KP, P: ARCH.KP,
}

// Flat, de-duplicated list of every archetype in the game (fallback when the
// row's position is blank or unrecognized).
export const ALL_ARCHETYPES = Array.from(
  new Set(Object.values(ARCH).flat()),
)

// Archetypes valid for a given position (all archetypes if position unknown).
export function archetypesForPosition(pos) {
  const key = (pos || '').toString().trim().toUpperCase()
  return ARCHETYPES_BY_POSITION[key] || ALL_ARCHETYPES
}
