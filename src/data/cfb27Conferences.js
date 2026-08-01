// CFB 27 conference alignment, keyed by tid.
//
// Source: "CFB 27 NIL_PRESTIGE (FULL LIST).xlsx" (Data sheet, conf column),
// resolved to tids offline. This is the CFB 27 realignment (e.g. a rebuilt
// 8-team Pac-12), which differs from the base 2024-25 alignment in
// conferenceTeams.js. Used for cfb27 dynasties at creation.
export const CFB27_CONFERENCES = {
  1: 'Mountain West', // Air Force Falcons
  2: 'MAC', // Akron Zips
  3: 'Sun Belt', // Appalachian State Mountaineers
  4: 'Big 12', // Arizona Wildcats
  5: 'SEC', // Arkansas Razorbacks
  6: 'American', // Army Black Knights
  7: 'Sun Belt', // Arkansas State Red Wolves
  8: 'Big 12', // Arizona State Sun Devils
  9: 'SEC', // Auburn Tigers
  10: 'MAC', // Ball State Cardinals
  11: 'SEC', // Alabama Crimson Tide
  12: 'ACC', // Boston College Eagles
  13: 'MAC', // Bowling Green Falcons
  14: 'Pac-12', // Boise State Broncos
  15: 'Big 12', // Baylor Bears
  16: 'MAC', // Buffalo Bulls
  17: 'Big 12', // Brigham Young Cougars
  18: 'ACC', // California Golden Bears
  19: 'Sun Belt', // Coastal Carolina Chanticleers
  20: 'American', // Charlotte 49ers
  21: 'ACC', // Clemson Tigers
  22: 'MAC', // Central Michigan Chippewas
  23: 'Big 12', // Colorado Buffaloes
  24: 'Independent', // Connecticut Huskies
  25: 'Pac-12', // Colorado State Rams
  26: 'Conference USA', // Delaware Fightin' Blue Hens
  27: 'ACC', // Duke Blue Devils
  28: 'American', // East Carolina Pirates
  29: 'MAC', // Eastern Michigan Eagles
  30: 'American', // Florida Atlantic Owls
  31: 'Conference USA', // Florida International Panthers
  32: 'SEC', // Florida Gators
  33: 'Pac-12', // Fresno State Bulldogs
  34: 'ACC', // Florida State Seminoles
  35: 'Sun Belt', // Georgia Southern Eagles
  36: 'Sun Belt', // Georgia State Panthers
  37: 'ACC', // Georgia Tech Yellow Jackets
  38: 'Mountain West', // Hawaii Rainbow Warriors
  39: 'Big Ten', // Illinois Fighting Illini
  40: 'Big Ten', // Iowa Hawkeyes
  41: 'Big 12', // Iowa State Cyclones
  42: 'Big Ten', // Indiana Hoosiers
  43: 'Conference USA', // Jacksonville State Gamecocks
  44: 'Sun Belt', // James Madison Dukes
  45: 'Conference USA', // Kennesaw State Owls
  46: 'MAC', // Kent State Golden Flashes
  47: 'Big 12', // Kansas State Wildcats
  48: 'Big 12', // Kansas Jayhawks
  49: 'Conference USA', // Liberty Flames
  50: 'ACC', // Louisville Cardinals
  51: 'SEC', // LSU Tigers
  52: 'Sun Belt', // Louisiana Tech Bulldogs
  53: 'MAC', // Miami Redhawks
  54: 'MAC', // Massachusetts Minutemen
  55: 'American', // Memphis Tigers
  56: 'ACC', // Miami Hurricanes
  57: 'Big Ten', // Michigan Wolverines
  58: 'Big Ten', // Minnesota Golden Gophers
  59: 'SEC', // Ole Miss Rebels
  60: 'SEC', // Missouri Tigers
  61: 'Sun Belt', // Marshall Thundering Herd
  62: 'SEC', // Mississippi State Bulldogs
  63: 'Big Ten', // Michigan State Spartans
  64: 'Conference USA', // Middle Tennessee State Blue Raiders
  65: 'Conference USA', // Missouri State Bears
  66: 'American', // Navy Midshipmen
  67: 'ACC', // North Carolina State Wolfpack
  68: 'Independent', // Notre Dame Fighting Irish
  69: 'Big Ten', // Nebraska Cornhuskers
  70: 'Mountain West', // Nevada Wolf Pack
  71: 'Mountain West', // Northern Illinois Huskies
  72: 'Conference USA', // New Mexico State Aggies
  73: 'Big Ten', // Northwestern Wildcats
  74: 'Sun Belt', // Old Dominion Monarchs
  75: 'MAC', // Ohio Bobcats
  76: 'Big 12', // Oklahoma State Cowboys
  77: 'Big Ten', // Oregon Ducks
  78: 'Pac-12', // Oregon State Beavers
  79: 'Big Ten', // Ohio State Buckeyes
  80: 'SEC', // Oklahoma Sooners
  81: 'ACC', // Pittsburgh Panthers
  82: 'Big Ten', // Penn State Nittany Lions
  83: 'Big Ten', // Purdue Boilermakers
  84: 'American', // Rice Owls
  85: 'Big Ten', // Rutgers Scarlet Knights
  86: 'SEC', // South Carolina Gamecocks
  87: 'Pac-12', // San Diego State Aztecs
  88: 'Conference USA', // Sam Houston State Bearkats
  89: 'Mountain West', // San Jose State Spartans
  90: 'ACC', // SMU Mustangs
  91: 'ACC', // Stanford Cardinal
  92: 'ACC', // Syracuse Orange
  93: 'SEC', // Texas A&M Aggies
  94: 'Big 12', // TCU Horned Frogs
  95: 'American', // Temple Owls
  96: 'SEC', // Texas Longhorns
  97: 'American', // Tulsa Golden Hurricane
  98: 'MAC', // Toledo Rockets
  99: 'Sun Belt', // Troy Trojans
  100: 'Big 12', // Texas Tech Red Raiders
  101: 'American', // Tulane Green Wave
  102: 'Pac-12', // Texas State Bobcats
  103: 'American', // UAB Blazers
  104: 'Big 12', // Cincinnati Bearcats
  105: 'Big 12', // UCF Knights
  106: 'Big Ten', // UCLA Bruins
  107: 'SEC', // Georgia Bulldogs
  108: 'Big 12', // Houston Cougars
  109: 'SEC', // Kentucky Wildcats
  110: 'Sun Belt', // Lafayette Ragin' Cajuns
  111: 'Sun Belt', // Monroe Warhawks
  112: 'Big Ten', // Maryland Terrapins
  113: 'ACC', // North Carolina Tar Heels
  114: 'Mountain West', // UNLV Rebels
  115: 'Mountain West', // New Mexico Lobos
  116: 'American', // North Texas Mean Green
  117: 'Sun Belt', // South Alabama Jaguars
  118: 'Big Ten', // USC Trojans
  119: 'American', // South Florida Bulls
  120: 'Sun Belt', // Southern Mississippi Golden Eagles
  121: 'Pac-12', // Utah State Aggies
  122: 'SEC', // Tennessee Volunteers
  123: 'Big 12', // Utah Utes
  124: 'Mountain West', // UTEP Miners
  125: 'American', // UTSA Roadrunners
  126: 'ACC', // Virginia Cavaliers
  127: 'SEC', // Vanderbilt Commodores
  128: 'ACC', // Virginia Tech Hokies
  129: 'ACC', // Wake Forest Demon Deacons
  130: 'Big Ten', // Washington Huskies
  131: 'Big Ten', // Wisconsin Badgers
  132: 'Conference USA', // Western Kentucky Hilltoppers
  133: 'MAC', // Western Michigan Broncos
  134: 'Pac-12', // Washington State Cougars
  135: 'Big 12', // West Virginia Mountaineers
  136: 'Mountain West', // Wyoming Cowboys
  142: 'Mountain West', // North Dakota State Bison
  143: 'MAC', // Sacramento State Hornets
}

export default CFB27_CONFERENCES
