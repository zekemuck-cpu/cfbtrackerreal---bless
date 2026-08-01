// CFB 27 launch team ratings (OVR / Offense / Defense), keyed by tid.
//
// Source: "CFB27 Team Ratings - Base Launch.xlsx" (All Teams sheet), parsed once
// and resolved to tids offline so there is no runtime name matching. Covers all
// 138 FBS teams (tids 1-136, 142-143); the five generic FCS placeholders
// (137-141) have no launch rating and are intentionally absent.
//
// Seeded into a CFB 27 dynasty's START YEAR only, at creation
// (teams[tid].byYear[startYear].teamRatings). Because team ratings are
// year-keyed, these display on day one and naturally clear when the season
// advances to the next year (which has no seeded entry) — the user maintains
// ratings themselves from year two on.
export const CFB27_TEAM_RATINGS = {
  1: { ovr: 66, off: 66, def: 66 }, // Air Force Falcons
  2: { ovr: 64, off: 64, def: 64 }, // Akron Zips
  3: { ovr: 71, off: 71, def: 71 }, // Appalachian State Mountaineers
  4: { ovr: 79, off: 79, def: 79 }, // Arizona Wildcats
  5: { ovr: 82, off: 81, def: 84 }, // Arkansas Razorbacks
  6: { ovr: 67, off: 69, def: 64 }, // Army Black Knights
  7: { ovr: 70, off: 71, def: 69 }, // Arkansas State Red Wolves
  8: { ovr: 79, off: 79, def: 81 }, // Arizona State Sun Devils
  9: { ovr: 85, off: 86, def: 84 }, // Auburn Tigers
  10: { ovr: 65, off: 66, def: 64 }, // Ball State Cardinals
  11: { ovr: 92, off: 91, def: 94 }, // Alabama Crimson Tide
  12: { ovr: 79, off: 79, def: 79 }, // Boston College Eagles
  13: { ovr: 67, off: 66, def: 69 }, // Bowling Green Falcons
  14: { ovr: 74, off: 74, def: 74 }, // Boise State Broncos
  15: { ovr: 79, off: 79, def: 79 }, // Baylor Bears
  16: { ovr: 66, off: 66, def: 66 }, // Buffalo Bulls
  17: { ovr: 82, off: 84, def: 81 }, // Brigham Young Cougars
  18: { ovr: 79, off: 79, def: 79 }, // California Golden Bears
  19: { ovr: 66, off: 66, def: 66 }, // Coastal Carolina Chanticleers
  20: { ovr: 66, off: 66, def: 66 }, // Charlotte 49ers
  21: { ovr: 84, off: 84, def: 86 }, // Clemson Tigers
  22: { ovr: 67, off: 69, def: 64 }, // Central Michigan Chippewas
  23: { ovr: 81, off: 81, def: 81 }, // Colorado Buffaloes
  24: { ovr: 71, off: 71, def: 71 }, // Connecticut Huskies
  25: { ovr: 69, off: 69, def: 69 }, // Colorado State Rams
  26: { ovr: 66, off: 66, def: 66 }, // Delaware Fightin' Blue Hens
  27: { ovr: 75, off: 78, def: 74 }, // Duke Blue Devils
  28: { ovr: 69, off: 69, def: 69 }, // East Carolina Pirates
  29: { ovr: 65, off: 66, def: 64 }, // Eastern Michigan Eagles
  30: { ovr: 71, off: 71, def: 71 }, // Florida Atlantic Owls
  31: { ovr: 67, off: 66, def: 69 }, // Florida International Panthers
  32: { ovr: 86, off: 86, def: 86 }, // Florida Gators
  33: { ovr: 72, off: 74, def: 71 }, // Fresno State Bulldogs
  34: { ovr: 82, off: 84, def: 81 }, // Florida State Seminoles
  35: { ovr: 71, off: 71, def: 71 }, // Georgia Southern Eagles
  36: { ovr: 65, off: 66, def: 64 }, // Georgia State Panthers
  37: { ovr: 76, off: 76, def: 76 }, // Georgia Tech Yellow Jackets
  38: { ovr: 69, off: 69, def: 71 }, // Hawaii Rainbow Warriors
  39: { ovr: 72, off: 74, def: 71 }, // Illinois Fighting Illini
  40: { ovr: 79, off: 81, def: 76 }, // Iowa Hawkeyes
  41: { ovr: 74, off: 74, def: 74 }, // Iowa State Cyclones
  42: { ovr: 86, off: 86, def: 86 }, // Indiana Hoosiers
  43: { ovr: 70, off: 71, def: 69 }, // Jacksonville State Gamecocks
  44: { ovr: 70, off: 71, def: 69 }, // James Madison Dukes
  45: { ovr: 62, off: 61, def: 64 }, // Kennesaw State Owls
  46: { ovr: 64, off: 64, def: 64 }, // Kent State Golden Flashes
  47: { ovr: 76, off: 76, def: 76 }, // Kansas State Wildcats
  48: { ovr: 76, off: 76, def: 76 }, // Kansas Jayhawks
  49: { ovr: 72, off: 74, def: 71 }, // Liberty Flames
  50: { ovr: 82, off: 81, def: 84 }, // Louisville Cardinals
  51: { ovr: 89, off: 89, def: 89 }, // LSU Tigers
  52: { ovr: 67, off: 69, def: 66 }, // Louisiana Tech Bulldogs
  53: { ovr: 70, off: 71, def: 69 }, // Miami Redhawks
  54: { ovr: 66, off: 66, def: 66 }, // Massachusetts Minutemen
  55: { ovr: 77, off: 79, def: 74 }, // Memphis Tigers
  56: { ovr: 87, off: 86, def: 89 }, // Miami Hurricanes
  57: { ovr: 89, off: 89, def: 89 }, // Michigan Wolverines
  58: { ovr: 79, off: 79, def: 79 }, // Minnesota Golden Gophers
  59: { ovr: 86, off: 86, def: 86 }, // Ole Miss Rebels
  60: { ovr: 84, off: 86, def: 81 }, // Missouri Tigers
  61: { ovr: 67, off: 66, def: 69 }, // Marshall Thundering Herd
  62: { ovr: 82, off: 81, def: 84 }, // Mississippi State Bulldogs
  63: { ovr: 80, off: 81, def: 79 }, // Michigan State Spartans
  64: { ovr: 67, off: 66, def: 69 }, // Middle Tennessee State Blue Raiders
  65: { ovr: 64, off: 64, def: 64 }, // Missouri State Bears
  66: { ovr: 65, off: 66, def: 64 }, // Navy Midshipmen
  67: { ovr: 76, off: 76, def: 76 }, // North Carolina State Wolfpack
  68: { ovr: 91, off: 91, def: 91 }, // Notre Dame Fighting Irish
  69: { ovr: 84, off: 84, def: 84 }, // Nebraska Cornhuskers
  70: { ovr: 69, off: 69, def: 69 }, // Nevada Wolf Pack
  71: { ovr: 64, off: 66, def: 61 }, // Northern Illinois Huskies
  72: { ovr: 66, off: 66, def: 66 }, // New Mexico State Aggies
  73: { ovr: 75, off: 78, def: 74 }, // Northwestern Wildcats
  74: { ovr: 64, off: 64, def: 66 }, // Old Dominion Monarchs
  75: { ovr: 67, off: 66, def: 69 }, // Ohio Bobcats
  76: { ovr: 77, off: 76, def: 79 }, // Oklahoma State Cowboys
  77: { ovr: 91, off: 91, def: 91 }, // Oregon Ducks
  78: { ovr: 74, off: 74, def: 74 }, // Oregon State Beavers
  79: { ovr: 94, off: 94, def: 94 }, // Ohio State Buckeyes
  80: { ovr: 86, off: 86, def: 86 }, // Oklahoma Sooners
  81: { ovr: 79, off: 81, def: 76 }, // Pittsburgh Panthers
  82: { ovr: 84, off: 84, def: 84 }, // Penn State Nittany Lions
  83: { ovr: 76, off: 76, def: 76 }, // Purdue Boilermakers
  84: { ovr: 66, off: 66, def: 66 }, // Rice Owls
  85: { ovr: 76, off: 76, def: 76 }, // Rutgers Scarlet Knights
  86: { ovr: 85, off: 86, def: 84 }, // South Carolina Gamecocks
  87: { ovr: 75, off: 76, def: 74 }, // San Diego State Aztecs
  88: { ovr: 69, off: 71, def: 66 }, // Sam Houston State Bearkats
  89: { ovr: 69, off: 69, def: 69 }, // San Jose State Spartans
  90: { ovr: 81, off: 81, def: 81 }, // SMU Mustangs
  91: { ovr: 76, off: 76, def: 76 }, // Stanford Cardinal
  92: { ovr: 76, off: 76, def: 76 }, // Syracuse Orange
  93: { ovr: 89, off: 89, def: 91 }, // Texas A&M Aggies
  94: { ovr: 80, off: 81, def: 79 }, // TCU Horned Frogs
  95: { ovr: 72, off: 74, def: 71 }, // Temple Owls
  96: { ovr: 89, off: 89, def: 91 }, // Texas Longhorns
  97: { ovr: 71, off: 71, def: 71 }, // Tulsa Golden Hurricane
  98: { ovr: 69, off: 69, def: 69 }, // Toledo Rockets
  99: { ovr: 69, off: 69, def: 71 }, // Troy Trojans
  100: { ovr: 86, off: 86, def: 86 }, // Texas Tech Red Raiders
  101: { ovr: 72, off: 71, def: 74 }, // Tulane Green Wave
  102: { ovr: 69, off: 69, def: 69 }, // Texas State Bobcats
  103: { ovr: 69, off: 69, def: 71 }, // UAB Blazers
  104: { ovr: 75, off: 76, def: 74 }, // Cincinnati Bearcats
  105: { ovr: 77, off: 79, def: 76 }, // UCF Knights
  106: { ovr: 81, off: 81, def: 81 }, // UCLA Bruins
  107: { ovr: 94, off: 94, def: 94 }, // Georgia Bulldogs
  108: { ovr: 77, off: 79, def: 76 }, // Houston Cougars
  109: { ovr: 81, off: 81, def: 81 }, // Kentucky Wildcats
  110: { ovr: 67, off: 69, def: 66 }, // Lafayette Ragin' Cajuns
  111: { ovr: 64, off: 64, def: 64 }, // Monroe Warhawks
  112: { ovr: 80, off: 81, def: 79 }, // Maryland Terrapins
  113: { ovr: 79, off: 79, def: 79 }, // North Carolina Tar Heels
  114: { ovr: 74, off: 74, def: 74 }, // UNLV Rebels
  115: { ovr: 66, off: 66, def: 66 }, // New Mexico Lobos
  116: { ovr: 74, off: 78, def: 71 }, // North Texas Mean Green
  117: { ovr: 69, off: 69, def: 69 }, // South Alabama Jaguars
  118: { ovr: 84, off: 84, def: 84 }, // USC Trojans
  119: { ovr: 75, off: 78, def: 74 }, // South Florida Bulls
  120: { ovr: 69, off: 69, def: 69 }, // Southern Mississippi Golden Eagles
  121: { ovr: 72, off: 71, def: 74 }, // Utah State Aggies
  122: { ovr: 86, off: 86, def: 86 }, // Tennessee Volunteers
  123: { ovr: 79, off: 79, def: 79 }, // Utah Utes
  124: { ovr: 64, off: 64, def: 64 }, // UTEP Miners
  125: { ovr: 72, off: 74, def: 69 }, // UTSA Roadrunners
  126: { ovr: 84, off: 84, def: 84 }, // Virginia Cavaliers
  127: { ovr: 79, off: 79, def: 79 }, // Vanderbilt Commodores
  128: { ovr: 81, off: 81, def: 81 }, // Virginia Tech Hokies
  129: { ovr: 76, off: 76, def: 76 }, // Wake Forest Demon Deacons
  130: { ovr: 82, off: 81, def: 84 }, // Washington Huskies
  131: { ovr: 80, off: 81, def: 79 }, // Wisconsin Badgers
  132: { ovr: 67, off: 69, def: 66 }, // Western Kentucky Hilltoppers
  133: { ovr: 67, off: 69, def: 66 }, // Western Michigan Broncos
  134: { ovr: 72, off: 74, def: 71 }, // Washington State Cougars
  135: { ovr: 79, off: 81, def: 76 }, // West Virginia Mountaineers
  136: { ovr: 67, off: 69, def: 66 }, // Wyoming Cowboys
  142: { ovr: 67, off: 69, def: 66 }, // North Dakota State Bison
  143: { ovr: 71, off: 71, def: 71 }, // Sacramento State Hornets
}

export default CFB27_TEAM_RATINGS
