// Complete structural attribute mapping matrices meticulously extracted from the Config tab
export const POSITION_ATTRIBUTES = {
  QB: ["Awareness", "Throw Power", "Short Accuracy", "Medium Accuracy", "Deep Accuracy", "Throw On Run", "Under Pressure", "Break Sack", "Speed", "Acceleration"],
  HB: ["Awareness", "Speed", "Acceleration", "Carrying", "Break Tackle", "Change of Direction", "Juke Move", "Spin Move", "BC Vision", "Catching"],
  WR: ["Awareness", "Speed", "Acceleration", "Catching", "Catch In Traffic", "Spectacular Catch", "Short Route", "Medium Route", "Deep Route", "Release"],
  TE: ["Awareness", "Speed", "Strength", "Acceleration", "Run Block", "Pass Block", "Catching", "Catch In Traffic", "Short Route", "Medium Route"],
  OT: ["Awareness", "Run Block", "Run Block Power", "Run Block Finesse", "Pass Block", "Pass Block Power", "Pass Block Finesse", "Impact Blocking", "Agility", "Acceleration"],
  OG: ["Awareness", "Run Block", "Run Block Power", "Run Block Finesse", "Pass Block", "Pass Block Power", "Pass Block Finesse", "Impact Blocking", "Agility", "Acceleration"],
  C:  ["Awareness", "Run Block", "Run Block Power", "Run Block Finesse", "Pass Block", "Pass Block Power", "Pass Block Finesse", "Impact Blocking", "Agility", "Acceleration"],
  DE: ["Awareness", "Strength", "Acceleration", "Block Shedding", "Tackle", "Hit Power", "Power Moves", "Finesse Moves", "Speed", "Pursuit"],
  DT: ["Awareness", "Strength", "Acceleration", "Block Shedding", "Tackle", "Hit Power", "Power Moves", "Finesse Moves", "Speed", "Pursuit"],
  OLB: ["Awareness", "Speed", "Acceleration", "Strength", "Play Recognition", "Tackle", "Hit Power", "Pursuit", "Man Coverage", "Zone Coverage"],
  MIKE: ["Awareness", "Speed", "Acceleration", "Strength", "Play Recognition", "Tackle", "Hit Power", "Pursuit", "Man Coverage", "Zone Coverage"],
  CB: ["Awareness", "Speed", "Acceleration", "Change of Direction", "Agility", "Man Coverage", "Zone Coverage", "Press", "Catching", "Tackle"],
  FS: ["Awareness", "Speed", "Acceleration", "Change of Direction", "Agility", "Man Coverage", "Zone Coverage", "Press", "Catching", "Tackle"],
  SS: ["Awareness", "Speed", "Acceleration", "Change of Direction", "Agility", "Man Coverage", "Zone Coverage", "Press", "Catching", "Tackle"],
  ATH: ["Awareness", "Speed", "Acceleration", "Strength", "Agility", "Change of Direction", "Catching", "Tackle", "Zone Coverage", "Man Coverage"]
};

// Core base skill arrays for mapping lookup overrides
const ARRAYS = {
  WR_STANDARD: ["Awareness", "Speed", "Acceleration", "Catching", "Catch In Traffic", "Spectacular Catch", "Short Route", "Medium Route", "Deep Route", "Release"],
  WR_AGILITY: ["Awareness", "Speed", "Acceleration", "Catching", "Catch In Traffic", "Spectacular Catch", "Short Route", "Medium Route", "Deep Route", "Agility"],
  WR_BLOCK: ["Awareness", "Speed", "Acceleration", "Catching", "Catch In Traffic", "Spectacular Catch", "Short Route", "Medium Route", "Deep Route", "Run Block"],
  WR_THROWS: ["Awareness", "Speed", "Acceleration", "Catching", "Catch In Traffic", "Spectacular Catch", "Short Route", "Medium Route", "Deep Route", "Throw Power"],
  TE_VERTICAL: ["Awareness", "Speed", "Strength", "Acceleration", "Run Block", "Pass Block", "Catching", "Catch In Traffic", "Medium Route", "Deep Route"],
  TE_PHYSICAL: ["Awareness", "Speed", "Strength", "Acceleration", "Run Block", "Pass Block", "Catching", "Catch In Traffic", "Short Route", "Medium Route"],
  LINEMAN_STRENGTH: ["Awareness", "Run Block", "Run Block Power", "Run Block Finesse", "Pass Block", "Pass Block Power", "Pass Block Finesse", "Impact Blocking", "Agility", "Strength"],
  PASSER: ["Awareness", "Throw Power", "Short Accuracy", "Medium Accuracy", "Deep Accuracy", "Throw On Run", "Under Pressure", "Break Sack", "Speed", "Acceleration"],
  RUNNER: ["Awareness", "Speed", "Acceleration", "Carrying", "Break Tackle", "Change of Direction", "Juke Move", "Spin Move", "BC Vision", "Catching"],
  POWER_RUSHER: ["Awareness", "Strength", "Acceleration", "Block Shedding", "Tackle", "Hit Power", "Power Moves", "Finesse Moves", "Speed", "Pursuit"],
  LINEMAN_AGILE: ["Awareness", "Run Block", "Run Block Power", "Run Block Finesse", "Pass Block", "Pass Block Power", "Pass Block Finesse", "Impact Blocking", "Agility", "Acceleration"],
  LURKER: ["Awareness", "Speed", "Acceleration", "Strength", "Play Recognition", "Tackle", "Hit Power", "Pursuit", "Man Coverage", "Zone Coverage"],
  THUMPER: ["Awareness", "Speed", "Acceleration", "Strength", "Play Recognition", "Tackle", "Hit Power", "Pursuit", "Man Coverage", "Zone Coverage"]
};

// Explicit Archetype Specific Overrides mapping right past the ATH prefix straight to underlying attribute matrices
export const ARCHETYPE_OVERRIDES = {
  "Speedster": ARRAYS.WR_STANDARD,
  "Route Artist": ARRAYS.WR_AGILITY,
  "Elusive Route Runner": ARRAYS.WR_AGILITY,
  "Physical Route Runner": ARRAYS.WR_STANDARD,
  "Gritty Possession": ARRAYS.WR_BLOCK,
  "Contested Specialist": ARRAYS.WR_STANDARD,
  "Gadget": ARRAYS.WR_THROWS,
  "Vertical Threat": ARRAYS.TE_VERTICAL,
  "Raw Strength (OT)": ARRAYS.LINEMAN_STRENGTH,
  "Raw Strength (OG)": ARRAYS.LINEMAN_STRENGTH,
  "Raw Strength (C)": ARRAYS.LINEMAN_STRENGTH,
  
  // Explicit Athlete Class Routing Assignments
  "ATH - Power Rusher": ARRAYS.POWER_RUSHER,
  "ATH - East/West Playmaker": ARRAYS.RUNNER,
  "ATH - Contested Specialist": ARRAYS.WR_STANDARD,
  "ATH - Agile": ARRAYS.LINEMAN_AGILE,
  "ATH - Pure Runner": ARRAYS.PASSER, 
  "ATH - Dual Threat": ARRAYS.PASSER,
  "ATH - Contact Seeker": ARRAYS.RUNNER,
  "ATH - Lurker": ARRAYS.LURKER,
  "ATH - Pure Possession": ARRAYS.TE_PHYSICAL,
  "ATH - Thumper": ARRAYS.THUMPER,
  "ATH - Backfield Threat": ARRAYS.RUNNER,
  "ATH - Physical Route Runner": ARRAYS.TE_PHYSICAL
};

// Finalized blueprint structure updated to reflect your exact roster options
export const ARCHETYPE_REGISTRY = [
  { position: "QB", archetype: "Pocket Passer" },
  { position: "QB", archetype: "Dual Threat" },
  { position: "QB", archetype: "Backfield Creator" },
  { position: "QB", archetype: "Pure Runner" },
  { position: "HB", archetype: "Elusive Bruiser" },
  { position: "HB", archetype: "East/West Playmaker" },
  { position: "HB", archetype: "Contact Seeker" },
  { position: "HB", archetype: "Backfield Threat" },
  { position: "HB", archetype: "North/South Receiver" },
  { position: "HB", archetype: "North/South Blocker" },
  { position: "WR", archetype: "Speedster" },
  { position: "WR", archetype: "Route Artist" },
  { position: "WR", archetype: "Elusive Route Runner" },
  { position: "WR", archetype: "Physical Route Runner" },
  { position: "WR", archetype: "Gritty Possession" },
  { position: "WR", archetype: "Contested Specialist" },
  { position: "WR", archetype: "Gadget" },
  
  // Tight End Updates
  { position: "TE", archetype: "Vertical Threat" },
  { position: "TE", archetype: "Pure Possession" },
  { position: "TE", archetype: "Gritty Possession" },
  { position: "TE", archetype: "Physical Route Runner" },
  { position: "TE", archetype: "Pure Blocker" },
  
  { position: "OT", archetype: "Well Rounded" },
  { position: "OT", archetype: "Pass Protector" },
  { position: "OT", archetype: "Agile" },
  { position: "OT", archetype: "Raw Strength (OT)" },
  { position: "OG", archetype: "Well Rounded" },
  { position: "OG", archetype: "Pass Protector" },
  { position: "OG", archetype: "Agile" },
  { position: "OG", archetype: "Raw Strength (OG)" },
  
  // Center Updates
  { position: "C", archetype: "Well Rounded" },
  { position: "C", archetype: "Pass Protector" },
  { position: "C", archetype: "Agile" },
  { position: "C", archetype: "Raw Strength (C)" },
  
  // Defensive End Updates
  { position: "DE", archetype: "Edge Setter" },
  { position: "DE", archetype: "Power Rusher" },
  { position: "DE", archetype: "Speed Rusher" },
  { position: "DE", archetype: "Pure Power" },
  
  // Defensive Tackle Updates
  { position: "DT", archetype: "Power Rusher" },
  { position: "DT", archetype: "Speed Rusher" },
  { position: "DT", archetype: "Pure Power" },
  { position: "DT", archetype: "Gap Specialist" },
  
  // Linebacker Uniform Alignment Updates
  { position: "OLB", archetype: "Thumper" },
  { position: "OLB", archetype: "Signal Caller" },
  { position: "OLB", archetype: "Lurker" },
  { position: "MIKE", archetype: "Thumper" },
  { position: "MIKE", archetype: "Signal Caller" },
  { position: "MIKE", archetype: "Lurker" },
  
  // Defensive Back Secondary Alignment Updates
  { position: "CB", archetype: "Field" },
  { position: "CB", archetype: "Bump and Run" },
  { position: "CB", archetype: "Boundary" },
  { position: "CB", archetype: "Zone" },
  { position: "FS", archetype: "Hybrid" },
  { position: "FS", archetype: "Coverage Specialist" },
  { position: "FS", archetype: "Box Specialist" },
  { position: "SS", archetype: "Hybrid" },
  { position: "SS", archetype: "Coverage Specialist" },
  { position: "SS", archetype: "Box Specialist" },
  
  // Athlete Pipeline Variants
  { position: "ATH", archetype: "ATH - Power Rusher" },
  { position: "ATH", archetype: "ATH - East/West Playmaker" },
  { position: "ATH", archetype: "ATH - Contested Specialist" },
  { position: "ATH", archetype: "ATH - Agile" },
  { position: "ATH", archetype: "ATH - Pure Runner" },
  { position: "ATH", archetype: "ATH - Dual Threat" },
  { position: "ATH", archetype: "ATH - Contact Seeker" },
  { position: "ATH", archetype: "ATH - Lurker" },
  { position: "ATH", archetype: "ATH - Pure Possession" },
  { position: "ATH", archetype: "ATH - Thumper" },
  { position: "ATH", archetype: "ATH - Backfield Threat" },
  { position: "ATH", archetype: "ATH - Physical Route Runner" }
];
