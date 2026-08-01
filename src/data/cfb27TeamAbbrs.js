// CFB 27 team abbreviations, keyed by tid.
//
// The user-supplied launch abbreviation set for all 136 base FBS teams. Applied
// only to cfb27 dynasties, at creation, by overriding dynasty.teams[tid].abbr
// (the same per-dynasty override mechanism teambuilder teams use). The two
// cfb27-gated teams without a supplied abbr (NDSU tid 142, Sacramento State tid
// 143) keep their registry abbreviations.
//
// 27 of 136 differ from the base registry; the rest are listed for completeness
// so this file is the single authoritative cfb27 abbreviation set.
export const CFB27_TEAM_ABBRS = {
  1: 'AFA', // Air Force Falcons
  2: 'ZIPS', // Akron Zips (was AKR)
  3: 'APP', // Appalachian State Mountaineers
  4: 'ZONA', // Arizona Wildcats (was ARIZ)
  5: 'ARK', // Arkansas Razorbacks
  6: 'ARMY', // Army Black Knights
  7: 'ARST', // Arkansas State Red Wolves
  8: 'ASU', // Arizona State Sun Devils
  9: 'AUB', // Auburn Tigers
  10: 'BALL', // Ball State Cardinals
  11: 'BAMA', // Alabama Crimson Tide
  12: 'BC', // Boston College Eagles
  13: 'BGSU', // Bowling Green Falcons
  14: 'BSU', // Boise State Broncos (was BOIS)
  15: 'BAY', // Baylor Bears (was BU)
  16: 'BUFF', // Buffalo Bulls
  17: 'BYU', // Brigham Young Cougars
  18: 'CAL', // California Golden Bears
  19: 'CCAR', // Coastal Carolina Chanticleers (was CCU)
  20: 'CLT', // Charlotte 49ers (was CHAR)
  21: 'CLEM', // Clemson Tigers
  22: 'CMU', // Central Michigan Chippewas
  23: 'CU', // Colorado Buffaloes (was COLO)
  24: 'CONN', // Connecticut Huskies
  25: 'CSU', // Colorado State Rams
  26: 'DEL', // Delaware Fightin' Blue Hens
  27: 'DUKE', // Duke Blue Devils
  28: 'ECU', // East Carolina Pirates
  29: 'EMU', // Eastern Michigan Eagles
  30: 'FAU', // Florida Atlantic Owls
  31: 'FIU', // Florida International Panthers
  32: 'UF', // Florida Gators (was FLA)
  33: 'FRES', // Fresno State Bulldogs
  34: 'FSU', // Florida State Seminoles
  35: 'GASO', // Georgia Southern Eagles
  36: 'GAST', // Georgia State Panthers (was GSU)
  37: 'GT', // Georgia Tech Yellow Jackets
  38: 'HAW', // Hawaii Rainbow Warriors
  39: 'ILL', // Illinois Fighting Illini
  40: 'IOWA', // Iowa Hawkeyes
  41: 'ISU', // Iowa State Cyclones
  42: 'IU', // Indiana Hoosiers
  43: 'JXST', // Jacksonville State Gamecocks (was JKST)
  44: 'JMU', // James Madison Dukes
  45: 'KENN', // Kennesaw State Owls
  46: 'KENT', // Kent State Golden Flashes
  47: 'KSU', // Kansas State Wildcats
  48: 'KU', // Kansas Jayhawks
  49: 'LU', // Liberty Flames (was LIB)
  50: 'UL', // Louisville Cardinals (was LOU)
  51: 'LSU', // LSU Tigers
  52: 'LTU', // Louisiana Tech Bulldogs (was LT)
  53: 'M-OH', // Miami Redhawks
  54: 'MASS', // Massachusetts Minutemen
  55: 'MEM', // Memphis Tigers
  56: 'MIA', // Miami Hurricanes
  57: 'MICH', // Michigan Wolverines
  58: 'MINN', // Minnesota Golden Gophers
  59: 'MISS', // Ole Miss Rebels
  60: 'MIZZ', // Missouri Tigers (was MIZ)
  61: 'MRSH', // Marshall Thundering Herd
  62: 'MSST', // Mississippi State Bulldogs
  63: 'MSU', // Michigan State Spartans
  64: 'MTSU', // Middle Tennessee State Blue Raiders
  65: 'MZST', // Missouri State Bears
  66: 'NAVY', // Navy Midshipmen
  67: 'NCST', // North Carolina State Wolfpack
  68: 'ND', // Notre Dame Fighting Irish
  69: 'NEB', // Nebraska Cornhuskers
  70: 'NEV', // Nevada Wolf Pack
  71: 'NIU', // Northern Illinois Huskies
  72: 'NMSU', // New Mexico State Aggies
  73: 'NW', // Northwestern Wildcats (was NU)
  74: 'ODU', // Old Dominion Monarchs
  75: 'OHIO', // Ohio Bobcats
  76: 'OKST', // Oklahoma State Cowboys
  77: 'ORE', // Oregon Ducks
  78: 'ORST', // Oregon State Beavers
  79: 'OSU', // Ohio State Buckeyes
  80: 'OKLA', // Oklahoma Sooners (was OU)
  81: 'PITT', // Pittsburgh Panthers
  82: 'PSU', // Penn State Nittany Lions
  83: 'PUR', // Purdue Boilermakers
  84: 'RICE', // Rice Owls
  85: 'RU', // Rutgers Scarlet Knights (was RUTG)
  86: 'SCAR', // South Carolina Gamecocks
  87: 'SDSU', // San Diego State Aztecs
  88: 'SHSU', // Sam Houston State Bearkats
  89: 'SJSU', // San Jose State Spartans
  90: 'SMU', // SMU Mustangs
  91: 'STAN', // Stanford Cardinal
  92: 'CUSE', // Syracuse Orange (was SYR)
  93: 'TAMU', // Texas A&M Aggies
  94: 'TCU', // TCU Horned Frogs
  95: 'TEM', // Temple Owls
  96: 'TEX', // Texas Longhorns
  97: 'TLSA', // Tulsa Golden Hurricane
  98: 'TOL', // Toledo Rockets
  99: 'TROY', // Troy Trojans
  100: 'TTU', // Texas Tech Red Raiders
  101: 'TUL', // Tulane Green Wave (was TULN)
  102: 'TXST', // Texas State Bobcats
  103: 'UAB', // UAB Blazers
  104: 'CIN', // Cincinnati Bearcats (was UC)
  105: 'UCF', // UCF Knights
  106: 'UCLA', // UCLA Bruins
  107: 'UGA', // Georgia Bulldogs
  108: 'HOU', // Houston Cougars (was UH)
  109: 'UK', // Kentucky Wildcats
  110: 'ULL', // Lafayette Ragin' Cajuns (was UL)
  111: 'ULM', // Monroe Warhawks
  112: 'TERPS', // Maryland Terrapins (was UMD)
  113: 'UNC', // North Carolina Tar Heels
  114: 'UNLV', // UNLV Rebels
  115: 'UNM', // New Mexico Lobos
  116: 'NT', // North Texas Mean Green (was UNT)
  117: 'USA', // South Alabama Jaguars
  118: 'USC', // USC Trojans
  119: 'USF', // South Florida Bulls
  120: 'USM', // Southern Mississippi Golden Eagles
  121: 'USU', // Utah State Aggies
  122: 'TENN', // Tennessee Volunteers (was UT)
  123: 'UTAH', // Utah Utes
  124: 'UTEP', // UTEP Miners
  125: 'UTSA', // UTSA Roadrunners
  126: 'UVA', // Virginia Cavaliers
  127: 'VAND', // Vanderbilt Commodores (was VAN)
  128: 'VT', // Virginia Tech Hokies
  129: 'WAKE', // Wake Forest Demon Deacons
  130: 'WASH', // Washington Huskies
  131: 'WISC', // Wisconsin Badgers (was WIS)
  132: 'WKU', // Western Kentucky Hilltoppers
  133: 'WMU', // Western Michigan Broncos
  134: 'WSU', // Washington State Cougars
  135: 'WVU', // West Virginia Mountaineers
  136: 'WYO', // Wyoming Cowboys
}

export default CFB27_TEAM_ABBRS
