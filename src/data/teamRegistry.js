/**
 * Unified Team Registry - Single Source of Truth for Team Data
 *
 * TID (Team ID) is the primary identifier for all teams.
 *
 * How it works:
 * 1. TEAMS defines all 140 teams with permanent tids (1-136 FBS, 137-140 FCS)
 * 2. When a dynasty is created, dynasty.teams is initialized from TEAMS
 * 3. To create a teambuilder team, replace the data at that tid
 * 4. All app code references teams by tid, never by abbreviation
 * 5. All season-by-season data is stored under dynasty.teams[tid].byYear[year]
 *
 * Dynasty Team Structure:
 *   dynasty.teams[tid] = {
 *     // Static team info (can be replaced by teambuilder)
 *     tid: 122,
 *     abbr: "UT",
 *     name: "Tennessee Volunteers",
 *     primaryColor: "#FF8200",
 *     secondaryColor: "#FFFFFF",
 *     logo: "https://...",
 *     isCustom: false,  // true for teambuilder teams
 *
 *     // All season data lives here
 *     byYear: {
 *       2025: {
 *         schedule: [...],
 *         teamRatings: { power: 85, apRank: 12 },
 *         coachingStaff: [...],
 *         lockedCoachingStaff: [...],
 *         preseasonSetup: { scheduleEntered: true, rosterEntered: true, ... },
 *         recruitingCommitments: { ... },
 *         recruitingClassRank: 15,
 *         playersLeaving: [...],
 *         draftResults: [...],
 *         transferDestinations: { ... },
 *         portalTransferClass: { ... },
 *         fringeCaseClass: { ... },
 *         trainingResults: { ... },
 *         conferenceChampionshipData: { ... },
 *         bowlEligibilityData: { ... },
 *       },
 *       2026: { ... }
 *     }
 *   }
 *
 * Usage:
 *   const team = dynasty.teams[tid]
 *   const logo = team.logo
 *   const schedule = team.byYear[2025]?.schedule
 */

// ============================================================================
// MASTER TEAM LIST - TID IS THE PRIMARY KEY
// ============================================================================
// Each team has a permanent tid that never changes.
// Fields: tid, abbr, name, primaryColor, secondaryColor, logo, isFCS

export const TEAMS = {
  1: {
    tid: 1,
    abbr: "AFA",
    name: "Air Force Falcons",
    primaryColor: "#00308f",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/G681EtX.png"
  },
  2: {
    tid: 2,
    abbr: "AKR",
    name: "Akron Zips",
    primaryColor: "#002147",
    secondaryColor: "#918b4c",
    logo: "https://i.imgur.com/6zUeZSt.png"
  },
  3: {
    tid: 3,
    abbr: "APP",
    name: "Appalachian State Mountaineers",
    primaryColor: "#222222",
    secondaryColor: "#ffcc00",
    logo: "https://i.imgur.com/CLOVDAA.png"
  },
  4: {
    tid: 4,
    abbr: "ARIZ",
    name: "Arizona Wildcats",
    primaryColor: "#AB0520",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/8EkFZUR.png"
  },
  5: {
    tid: 5,
    abbr: "ARK",
    name: "Arkansas Razorbacks",
    primaryColor: "#9D2235",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/Ex6Eytj.png"
  },
  6: {
    tid: 6,
    abbr: "ARMY",
    name: "Army Black Knights",
    primaryColor: "#000000",
    secondaryColor: "#d3bc8d",
    logo: "https://i.imgur.com/ItRoAOS.png"
  },
  7: {
    tid: 7,
    abbr: "ARST",
    name: "Arkansas State Red Wolves",
    primaryColor: "#cc092f",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/oIpVKLR.png"
  },
  8: {
    tid: 8,
    abbr: "ASU",
    name: "Arizona State Sun Devils",
    primaryColor: "#990033",
    secondaryColor: "#FFB310",
    logo: "https://i.imgur.com/j2rLkcJ.png"
  },
  9: {
    tid: 9,
    abbr: "AUB",
    name: "Auburn Tigers",
    primaryColor: "#0C2340",
    secondaryColor: "#F26522",
    logo: "https://i.imgur.com/W9xdTG6.png"
  },
  10: {
    tid: 10,
    abbr: "BALL",
    name: "Ball State Cardinals",
    primaryColor: "#BA0C2F",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/CYSacTE.png"
  },
  11: {
    tid: 11,
    abbr: "BAMA",
    name: "Alabama Crimson Tide",
    primaryColor: "#9e1b32",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/GSZQpoc.png"
  },
  12: {
    tid: 12,
    abbr: "BC",
    name: "Boston College Eagles",
    primaryColor: "#910039",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/aTfqVvH.png"
  },
  13: {
    tid: 13,
    abbr: "BGSU",
    name: "Bowling Green Falcons",
    primaryColor: "#4F2C1D",
    secondaryColor: "#FE5000",
    logo: "https://i.imgur.com/VfeB3Og.png"
  },
  14: {
    tid: 14,
    abbr: "BOIS",
    name: "Boise State Broncos",
    primaryColor: "#09347A",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/0wWZR5S.png"
  },
  15: {
    tid: 15,
    abbr: "BU",
    name: "Baylor Bears",
    primaryColor: "#003015",
    secondaryColor: "#fecb00",
    logo: "https://i.imgur.com/wXkLNMi.png"
  },
  16: {
    tid: 16,
    abbr: "BUFF",
    name: "Buffalo Bulls",
    primaryColor: "#005bbb",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/E8Xk6Rx.png"
  },
  17: {
    tid: 17,
    abbr: "BYU",
    name: "Brigham Young Cougars",
    primaryColor: "#002255",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/lI8iDxc.png"
  },
  18: {
    tid: 18,
    abbr: "CAL",
    name: "California Golden Bears",
    primaryColor: "#041E42",
    secondaryColor: "#FFC72C",
    logo: "https://i.imgur.com/zMvNh7F.png"
  },
  19: {
    tid: 19,
    abbr: "CCU",
    name: "Coastal Carolina Chanticleers",
    primaryColor: "#006F71",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/QdyWaWM.png"
  },
  20: {
    tid: 20,
    abbr: "CHAR",
    name: "Charlotte 49ers",
    primaryColor: "#046a38",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/UbS3QQ1.png"
  },
  21: {
    tid: 21,
    abbr: "CLEM",
    name: "Clemson Tigers",
    primaryColor: "#F56600",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/pROGKze.png"
  },
  22: {
    tid: 22,
    abbr: "CMU",
    name: "Central Michigan Chippewas",
    primaryColor: "#6a0032",
    secondaryColor: "#ffc82e",
    logo: "https://i.imgur.com/Cbcjcx2.png"
  },
  23: {
    tid: 23,
    abbr: "COLO",
    name: "Colorado Buffaloes",
    primaryColor: "#000000",
    secondaryColor: "#CFB87C",
    logo: "https://i.imgur.com/pRWGpft.png"
  },
  24: {
    tid: 24,
    abbr: "CONN",
    name: "Connecticut Huskies",
    primaryColor: "#000E2F",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/jQd2zR9.png"
  },
  25: {
    tid: 25,
    abbr: "CSU",
    name: "Colorado State Rams",
    primaryColor: "#1E4D2B",
    secondaryColor: "#C8C372",
    logo: "https://i.imgur.com/AD1Z03j.png"
  },
  26: {
    tid: 26,
    abbr: "DEL",
    name: "Delaware Fightin' Blue Hens",
    primaryColor: "#00539F",
    secondaryColor: "#FFDD31",
    logo: "https://i.imgur.com/uj7mkBT.png"
  },
  27: {
    tid: 27,
    abbr: "DUKE",
    name: "Duke Blue Devils",
    primaryColor: "#001A57",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/gLVKep0.png"
  },
  28: {
    tid: 28,
    abbr: "ECU",
    name: "East Carolina Pirates",
    primaryColor: "#592A8A",
    secondaryColor: "#FDC82F",
    logo: "https://i.imgur.com/V0qdjCf.png"
  },
  29: {
    tid: 29,
    abbr: "EMU",
    name: "Eastern Michigan Eagles",
    primaryColor: "#006633",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/gWngHs9.png"
  },
  30: {
    tid: 30,
    abbr: "FAU",
    name: "Florida Atlantic Owls",
    primaryColor: "#003366",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/DkHBjJl.png"
  },
  31: {
    tid: 31,
    abbr: "FIU",
    name: "Florida International Panthers",
    primaryColor: "#081E3F",
    secondaryColor: "#B6862C",
    logo: "https://i.imgur.com/HYgpDWB.png"
  },
  32: {
    tid: 32,
    abbr: "FLA",
    name: "Florida Gators",
    primaryColor: "#0021a5",
    secondaryColor: "#FA4616",
    logo: "https://i.imgur.com/rMdZfeC.png"
  },
  33: {
    tid: 33,
    abbr: "FRES",
    name: "Fresno State Bulldogs",
    primaryColor: "#C41230",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/g1dJuYI.png"
  },
  34: {
    tid: 34,
    abbr: "FSU",
    name: "Florida State Seminoles",
    primaryColor: "#782F40",
    secondaryColor: "#CEB888",
    logo: "https://i.imgur.com/sVMLEHK.png"
  },
  35: {
    tid: 35,
    abbr: "GASO",
    name: "Georgia Southern Eagles",
    primaryColor: "#011e41",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/mdmOccs.png"
  },
  36: {
    tid: 36,
    abbr: "GSU",
    name: "Georgia State Panthers",
    primaryColor: "#0039A6",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/XO5zyB9.png"
  },
  37: {
    tid: 37,
    abbr: "GT",
    name: "Georgia Tech Yellow Jackets",
    primaryColor: "#C59353",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/Ysz59VM.png"
  },
  38: {
    tid: 38,
    abbr: "HAW",
    name: "Hawaii Rainbow Warriors",
    primaryColor: "#024731",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/4Afe87s.png"
  },
  39: {
    tid: 39,
    abbr: "ILL",
    name: "Illinois Fighting Illini",
    primaryColor: "#e04e39",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/vklZme6.png"
  },
  40: {
    tid: 40,
    abbr: "IOWA",
    name: "Iowa Hawkeyes",
    primaryColor: "#000000",
    secondaryColor: "#FFE100",
    logo: "https://i.imgur.com/ydHy2Fe.png"
  },
  41: {
    tid: 41,
    abbr: "ISU",
    name: "Iowa State Cyclones",
    primaryColor: "#a6192e",
    secondaryColor: "#FDC82F",
    logo: "https://i.imgur.com/VubsqM8.png"
  },
  42: {
    tid: 42,
    abbr: "IU",
    name: "Indiana Hoosiers",
    primaryColor: "#990000",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/2b8EE6q.png"
  },
  43: {
    tid: 43,
    abbr: "JKST",
    name: "Jacksonville State Gamecocks",
    primaryColor: "#CC0000",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/YQ9UB5F.png"
  },
  44: {
    tid: 44,
    abbr: "JMU",
    name: "James Madison Dukes",
    primaryColor: "#450084",
    secondaryColor: "#CBB677",
    logo: "https://i.imgur.com/rJnhTUG.png"
  },
  45: {
    tid: 45,
    abbr: "KENN",
    name: "Kennesaw State Owls",
    primaryColor: "#FDBB30",
    secondaryColor: "#0B1315",
    logo: "https://i.imgur.com/kXNSolO.png"
  },
  46: {
    tid: 46,
    abbr: "KENT",
    name: "Kent State Golden Flashes",
    primaryColor: "#002664",
    secondaryColor: "#EAAB00",
    logo: "https://i.imgur.com/GF7m8eE.png"
  },
  47: {
    tid: 47,
    abbr: "KSU",
    name: "Kansas State Wildcats",
    primaryColor: "#512888",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/9QJFeWa.png"
  },
  48: {
    tid: 48,
    abbr: "KU",
    name: "Kansas Jayhawks",
    primaryColor: "#0051BA",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/CDxaFKY.png"
  },
  49: {
    tid: 49,
    abbr: "LIB",
    name: "Liberty Flames",
    primaryColor: "#002D62",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/HbtnueZ.png"
  },
  50: {
    tid: 50,
    abbr: "LOU",
    name: "Louisville Cardinals",
    primaryColor: "#AD0000",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/9sbwLXF.png"
  },
  51: {
    tid: 51,
    abbr: "LSU",
    name: "LSU Tigers",
    primaryColor: "#582c83",
    secondaryColor: "#ffc72c",
    logo: "https://i.imgur.com/VS17Nsy.png"
  },
  52: {
    tid: 52,
    abbr: "LT",
    name: "Louisiana Tech Bulldogs",
    primaryColor: "#003087",
    secondaryColor: "#CB333B",
    logo: "https://i.imgur.com/fTMLVzi.png"
  },
  53: {
    tid: 53,
    abbr: "M-OH",
    name: "Miami Redhawks",
    primaryColor: "#B61E2E",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/h3YybDS.png"
  },
  54: {
    tid: 54,
    abbr: "MASS",
    name: "Massachusetts Minutemen",
    primaryColor: "#881c1c",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/DpEq0GQ.png"
  },
  55: {
    tid: 55,
    abbr: "MEM",
    name: "Memphis Tigers",
    primaryColor: "#0D3182",
    secondaryColor: "#888C8F",
    logo: "https://i.imgur.com/KMyq79Q.png"
  },
  56: {
    tid: 56,
    abbr: "MIA",
    name: "Miami Hurricanes",
    primaryColor: "#005030",
    secondaryColor: "#f47321",
    logo: "https://i.imgur.com/SVtR4oY.png"
  },
  57: {
    tid: 57,
    abbr: "MICH",
    name: "Michigan Wolverines",
    primaryColor: "#ffcb05",
    secondaryColor: "#00274c",
    logo: "https://i.imgur.com/F611D29.png"
  },
  58: {
    tid: 58,
    abbr: "MINN",
    name: "Minnesota Golden Gophers",
    primaryColor: "#7a0019",
    secondaryColor: "#ffcc33",
    logo: "https://i.imgur.com/oiN1rtG.png"
  },
  59: {
    tid: 59,
    abbr: "MISS",
    name: "Ole Miss Rebels",
    primaryColor: "#00205b",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/nlFnhFv.png"
  },
  60: {
    tid: 60,
    abbr: "MIZ",
    name: "Missouri Tigers",
    primaryColor: "#000000",
    secondaryColor: "#F1B82D",
    logo: "https://i.imgur.com/SwMezGT.png"
  },
  61: {
    tid: 61,
    abbr: "MRSH",
    name: "Marshall Thundering Herd",
    primaryColor: "#0BB140",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/kznyRSc.png"
  },
  62: {
    tid: 62,
    abbr: "MSST",
    name: "Mississippi State Bulldogs",
    primaryColor: "#660000",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/MIk8N5r.png"
  },
  63: {
    tid: 63,
    abbr: "MSU",
    name: "Michigan State Spartans",
    primaryColor: "#18453B",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/m4QaHmu.png"
  },
  64: {
    tid: 64,
    abbr: "MTSU",
    name: "Middle Tennessee State Blue Raiders",
    primaryColor: "#0066CC",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/zp6fnpe.png"
  },
  65: {
    tid: 65,
    abbr: "MZST",
    name: "Missouri State Bears",
    primaryColor: "#5E0009",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/gybvEes.png"
  },
  66: {
    tid: 66,
    abbr: "NAVY",
    name: "Navy Midshipmen",
    primaryColor: "#00205b",
    secondaryColor: "#c5b783",
    logo: "https://i.imgur.com/1OaGRGp.png"
  },
  67: {
    tid: 67,
    abbr: "NCST",
    name: "North Carolina State Wolfpack",
    primaryColor: "#CC0000",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/acrRSno.png"
  },
  68: {
    tid: 68,
    abbr: "ND",
    name: "Notre Dame Fighting Irish",
    primaryColor: "#0C2340",
    secondaryColor: "#C99700",
    logo: "https://i.imgur.com/v5Jt5U0.png"
  },
  69: {
    tid: 69,
    abbr: "NEB",
    name: "Nebraska Cornhuskers",
    primaryColor: "#e41c38",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/2Oaz93O.png"
  },
  70: {
    tid: 70,
    abbr: "NEV",
    name: "Nevada Wolf Pack",
    primaryColor: "#003366",
    secondaryColor: "#807f84",
    logo: "https://i.imgur.com/fknfwmy.png"
  },
  71: {
    tid: 71,
    abbr: "NIU",
    name: "Northern Illinois Huskies",
    primaryColor: "#ba0c2f",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/rB45HBn.png"
  },
  72: {
    tid: 72,
    abbr: "NMSU",
    name: "New Mexico State Aggies",
    primaryColor: "#8c0b42",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/sdRGddP.png"
  },
  73: {
    tid: 73,
    abbr: "NU",
    name: "Northwestern Wildcats",
    primaryColor: "#4E2A84",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/XJ90C3s.png"
  },
  74: {
    tid: 74,
    abbr: "ODU",
    name: "Old Dominion Monarchs",
    primaryColor: "#05344C",
    secondaryColor: "#7c878e",
    logo: "https://i.imgur.com/mybV1nZ.png"
  },
  75: {
    tid: 75,
    abbr: "OHIO",
    name: "Ohio Bobcats",
    primaryColor: "#00694E",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/c0cvsse.png"
  },
  76: {
    tid: 76,
    abbr: "OKST",
    name: "Oklahoma State Cowboys",
    primaryColor: "#FF7300",
    secondaryColor: "#000000",
    logo: "https://i.imgur.com/wnZzORg.png"
  },
  77: {
    tid: 77,
    abbr: "ORE",
    name: "Oregon Ducks",
    primaryColor: "#154733",
    secondaryColor: "#FEE123",
    logo: "https://i.imgur.com/agCeDq7.png"
  },
  78: {
    tid: 78,
    abbr: "ORST",
    name: "Oregon State Beavers",
    primaryColor: "#C34500",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/Etg1WG6.png"
  },
  79: {
    tid: 79,
    abbr: "OSU",
    name: "Ohio State Buckeyes",
    primaryColor: "#bb0000",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/l4sb8kJ.png"
  },
  80: {
    tid: 80,
    abbr: "OU",
    name: "Oklahoma Sooners",
    primaryColor: "#841617",
    secondaryColor: "#FDF9D8",
    logo: "https://i.imgur.com/2xQtIAj.png"
  },
  81: {
    tid: 81,
    abbr: "PITT",
    name: "Pittsburgh Panthers",
    primaryColor: "#1c2957",
    secondaryColor: "#cdb87d",
    logo: "https://i.imgur.com/iOm9P7S.png"
  },
  82: {
    tid: 82,
    abbr: "PSU",
    name: "Penn State Nittany Lions",
    primaryColor: "#041e42",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/9xn2tA1.png"
  },
  83: {
    tid: 83,
    abbr: "PUR",
    name: "Purdue Boilermakers",
    primaryColor: "#000000",
    secondaryColor: "#CEB888",
    logo: "https://i.imgur.com/RVSg0ZT.png"
  },
  84: {
    tid: 84,
    abbr: "RICE",
    name: "Rice Owls",
    primaryColor: "#002469",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/9E8LJDL.png"
  },
  85: {
    tid: 85,
    abbr: "RUTG",
    name: "Rutgers Scarlet Knights",
    primaryColor: "#d21034",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/KqmENFW.png"
  },
  86: {
    tid: 86,
    abbr: "SCAR",
    name: "South Carolina Gamecocks",
    primaryColor: "#73000A",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/lraZiou.png"
  },
  87: {
    tid: 87,
    abbr: "SDSU",
    name: "San Diego State Aztecs",
    primaryColor: "#C41230",
    secondaryColor: "#000000",
    logo: "https://i.imgur.com/ntHVrPq.png"
  },
  88: {
    tid: 88,
    abbr: "SHSU",
    name: "Sam Houston State Bearkats",
    primaryColor: "#FE5100",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/f4L04yr.png"
  },
  89: {
    tid: 89,
    abbr: "SJSU",
    name: "San Jose State Spartans",
    primaryColor: "#0055A2",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/mEe0roq.png"
  },
  90: {
    tid: 90,
    abbr: "SMU",
    name: "SMU Mustangs",
    primaryColor: "#354ca1",
    secondaryColor: "#cd2027",
    logo: "https://i.imgur.com/kW6uKaE.png"
  },
  91: {
    tid: 91,
    abbr: "STAN",
    name: "Stanford Cardinal",
    primaryColor: "#8C1515",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/ZVUGplg.png"
  },
  92: {
    tid: 92,
    abbr: "SYR",
    name: "Syracuse Orange",
    primaryColor: "#D44500",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/RUwuZQ2.png"
  },
  93: {
    tid: 93,
    abbr: "TAMU",
    name: "Texas A&M Aggies",
    primaryColor: "#500000",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/e0PJnKV.png"
  },
  94: {
    tid: 94,
    abbr: "TCU",
    name: "TCU Horned Frogs",
    primaryColor: "#4d1979",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/3tf2B9g.png"
  },
  95: {
    tid: 95,
    abbr: "TEM",
    name: "Temple Owls",
    primaryColor: "#990033",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/B1iv8DV.png"
  },
  96: {
    tid: 96,
    abbr: "TEX",
    name: "Texas Longhorns",
    primaryColor: "#BF5700",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/q4vT2Mk.png"
  },
  97: {
    tid: 97,
    abbr: "TLSA",
    name: "Tulsa Golden Hurricane",
    primaryColor: "#c5b783",
    secondaryColor: "#002d72",
    logo: "https://i.imgur.com/0SmXB3e.png"
  },
  98: {
    tid: 98,
    abbr: "TOL",
    name: "Toledo Rockets",
    primaryColor: "#002569",
    secondaryColor: "#ffce00",
    logo: "https://i.imgur.com/PVqgA77.png"
  },
  99: {
    tid: 99,
    abbr: "TROY",
    name: "Troy Trojans",
    primaryColor: "#862633",
    secondaryColor: "#8a8d8f",
    logo: "https://i.imgur.com/asolJAj.png"
  },
  100: {
    tid: 100,
    abbr: "TTU",
    name: "Texas Tech Red Raiders",
    primaryColor: "#CC0000",
    secondaryColor: "#000000",
    logo: "https://i.imgur.com/3hII0Qo.png"
  },
  101: {
    tid: 101,
    abbr: "TULN",
    name: "Tulane Green Wave",
    primaryColor: "#005837",
    secondaryColor: "#0082ba",
    logo: "https://i.imgur.com/SYyJ9OY.png"
  },
  102: {
    tid: 102,
    abbr: "TXST",
    name: "Texas State Bobcats",
    primaryColor: "#501214",
    secondaryColor: "#8D734A",
    logo: "https://i.imgur.com/lGsXqwz.png"
  },
  103: {
    tid: 103,
    abbr: "UAB",
    name: "UAB Blazers",
    primaryColor: "#006341",
    secondaryColor: "#CC8A00",
    logo: "https://i.imgur.com/F0k67aG.png"
  },
  104: {
    tid: 104,
    abbr: "UC",
    name: "Cincinnati Bearcats",
    primaryColor: "#000000",
    secondaryColor: "#E00122",
    logo: "https://i.imgur.com/NYT8eiL.png"
  },
  105: {
    tid: 105,
    abbr: "UCF",
    name: "UCF Knights",
    primaryColor: "#000000",
    secondaryColor: "#BA9B37",
    logo: "https://i.imgur.com/LfBAhJl.png"
  },
  106: {
    tid: 106,
    abbr: "UCLA",
    name: "UCLA Bruins",
    primaryColor: "#0072ce",
    secondaryColor: "#ffc72c",
    logo: "https://i.imgur.com/h3jGxhG.png"
  },
  107: {
    tid: 107,
    abbr: "UGA",
    name: "Georgia Bulldogs",
    primaryColor: "#DA291C",
    secondaryColor: "#000000",
    logo: "https://i.imgur.com/SWGe1k7.png"
  },
  108: {
    tid: 108,
    abbr: "UH",
    name: "Houston Cougars",
    primaryColor: "#C92839",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/8gWIuq4.png"
  },
  109: {
    tid: 109,
    abbr: "UK",
    name: "Kentucky Wildcats",
    primaryColor: "#0033A0",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/M7PmVR7.png"
  },
  110: {
    tid: 110,
    abbr: "UL",
    name: "Lafayette Ragin' Cajuns",
    primaryColor: "#ce181e",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/UDJsamv.png"
  },
  111: {
    tid: 111,
    abbr: "ULM",
    name: "Monroe Warhawks",
    primaryColor: "#800029",
    secondaryColor: "#bd955a",
    logo: "https://i.imgur.com/O0Knoh1.png"
  },
  112: {
    tid: 112,
    abbr: "UMD",
    name: "Maryland Terrapins",
    primaryColor: "#c8102e",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/AHZmTu4.png"
  },
  113: {
    tid: 113,
    abbr: "UNC",
    name: "North Carolina Tar Heels",
    primaryColor: "#7BAFD4",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/uQwBbAg.png"
  },
  114: {
    tid: 114,
    abbr: "UNLV",
    name: "UNLV Rebels",
    primaryColor: "#B10202",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/trPAWON.png"
  },
  115: {
    tid: 115,
    abbr: "UNM",
    name: "New Mexico Lobos",
    primaryColor: "#B71234",
    secondaryColor: "#C3C8C8",
    logo: "https://i.imgur.com/PgMCRT5.png"
  },
  116: {
    tid: 116,
    abbr: "UNT",
    name: "North Texas Mean Green",
    primaryColor: "#00853E",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/FJu27tr.png"
  },
  117: {
    tid: 117,
    abbr: "USA",
    name: "South Alabama Jaguars",
    primaryColor: "#00205B",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/VOI9pnS.png"
  },
  118: {
    tid: 118,
    abbr: "USC",
    name: "USC Trojans",
    primaryColor: "#990000",
    secondaryColor: "#FFCC00",
    logo: "https://i.imgur.com/Fs85ZZ5.png"
  },
  119: {
    tid: 119,
    abbr: "USF",
    name: "South Florida Bulls",
    primaryColor: "#006747",
    secondaryColor: "#CFC493",
    logo: "https://i.imgur.com/cv0dFiI.png"
  },
  120: {
    tid: 120,
    abbr: "USM",
    name: "Southern Mississippi Golden Eagles",
    primaryColor: "#000000",
    secondaryColor: "#FDC737",
    logo: "https://i.imgur.com/hMPAEnR.png"
  },
  121: {
    tid: 121,
    abbr: "USU",
    name: "Utah State Aggies",
    primaryColor: "#0F2439",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/bOJ7lDL.png"
  },
  122: {
    tid: 122,
    abbr: "UT",
    name: "Tennessee Volunteers",
    primaryColor: "#FF8200",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/bZWLkmZ.png"
  },
  123: {
    tid: 123,
    abbr: "UTAH",
    name: "Utah Utes",
    primaryColor: "#CC0000",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/tkZnRXA.png"
  },
  124: {
    tid: 124,
    abbr: "UTEP",
    name: "UTEP Miners",
    primaryColor: "#002147",
    secondaryColor: "#FF5600",
    logo: "https://i.imgur.com/BlsFSLQ.png"
  },
  125: {
    tid: 125,
    abbr: "UTSA",
    name: "UTSA Roadrunners",
    primaryColor: "#0c2340",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/OmMX64U.png"
  },
  126: {
    tid: 126,
    abbr: "UVA",
    name: "Virginia Cavaliers",
    primaryColor: "#041e42",
    secondaryColor: "#fa4616",
    logo: "https://i.imgur.com/KJOkotE.png"
  },
  127: {
    tid: 127,
    abbr: "VAN",
    name: "Vanderbilt Commodores",
    primaryColor: "#000000",
    secondaryColor: "#997F3D",
    logo: "https://i.imgur.com/2iN56zn.png"
  },
  128: {
    tid: 128,
    abbr: "VT",
    name: "Virginia Tech Hokies",
    primaryColor: "#660000",
    secondaryColor: "#FF6600",
    logo: "https://i.imgur.com/FDlQUs2.png"
  },
  129: {
    tid: 129,
    abbr: "WAKE",
    name: "Wake Forest Demon Deacons",
    primaryColor: "#000000",
    secondaryColor: "#9E7E38",
    logo: "https://i.imgur.com/rSbzrAk.png"
  },
  130: {
    tid: 130,
    abbr: "WASH",
    name: "Washington Huskies",
    primaryColor: "#363c74",
    secondaryColor: "#e8d3a2",
    logo: "https://i.imgur.com/HYesxla.png"
  },
  131: {
    tid: 131,
    abbr: "WIS",
    name: "Wisconsin Badgers",
    primaryColor: "#c5050c",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/qEPZKqG.png"
  },
  132: {
    tid: 132,
    abbr: "WKU",
    name: "Western Kentucky Hilltoppers",
    primaryColor: "#B01E24",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/xgwRtOn.png"
  },
  133: {
    tid: 133,
    abbr: "WMU",
    name: "Western Michigan Broncos",
    primaryColor: "#6c4023",
    secondaryColor: "#b5a167",
    logo: "https://i.imgur.com/9NB1uSz.png"
  },
  134: {
    tid: 134,
    abbr: "WSU",
    name: "Washington State Cougars",
    primaryColor: "#981e32",
    secondaryColor: "#5e6a71",
    logo: "https://i.imgur.com/ugQGdDM.png"
  },
  135: {
    tid: 135,
    abbr: "WVU",
    name: "West Virginia Mountaineers",
    primaryColor: "#002855",
    secondaryColor: "#EAAA00",
    logo: "https://i.imgur.com/U1uvExa.png"
  },
  136: {
    tid: 136,
    abbr: "WYO",
    name: "Wyoming Cowboys",
    primaryColor: "#492f24",
    secondaryColor: "#ffc425",
    logo: "https://i.imgur.com/Pjw5U7w.png"
  },
  // FCS Teams (137-140)
  137: {
    tid: 137,
    abbr: "FCSE",
    name: "FCS East Judicials",
    primaryColor: "#2F1936",
    secondaryColor: "#8E85A1",
    logo: "https://i.imgur.com/eFyXxwT.png",
    isFCS: true
  },
  138: {
    tid: 138,
    abbr: "FCSM",
    name: "FCS Midwest Rebels",
    primaryColor: "#91ABC7",
    secondaryColor: "#1a1a1a",
    logo: "https://i.imgur.com/NOJOPG8.png",
    isFCS: true
  },
  139: {
    tid: 139,
    abbr: "FCSN",
    name: "FCS Northwest Stallions",
    primaryColor: "#BFA544",
    secondaryColor: "#477F62",
    logo: "https://i.imgur.com/uBvbn1s.png",
    isFCS: true
  },
  140: {
    tid: 140,
    abbr: "FCSW",
    name: "FCS West Titans",
    primaryColor: "#462E6A",
    secondaryColor: "#AF9458",
    logo: "https://i.imgur.com/Y8A8u0g.png",
    isFCS: true
  }
}

// ============================================================================
// LOOKUP MAPS - Built once for fast lookups
// ============================================================================

// Abbreviation -> tid
export const ABBR_TO_TID = {}
for (const [tid, team] of Object.entries(TEAMS)) {
  ABBR_TO_TID[team.abbr] = parseInt(tid)
}

// Full name -> tid
export const NAME_TO_TID = {}
for (const [tid, team] of Object.entries(TEAMS)) {
  NAME_TO_TID[team.name] = parseInt(tid)
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get team data by tid from a dynasty's team map.
 * This is the PRIMARY lookup function - use this everywhere.
 *
 * @param {Object} teams - The dynasty.teams object (or TEAMS for static lookup)
 * @param {number} tid - Team ID
 * @returns {Object|null} Team data or null
 */
export function getTeam(teams, tid) {
  if (!teams || tid == null) return null
  return teams[tid] || null
}

/**
 * Get tid from abbreviation.
 * Use this for migration - convert old abbr-based data to tid.
 *
 * @param {string} abbr - Team abbreviation (e.g., "BAMA")
 * @returns {number|null} Team ID or null
 */
export function getTidFromAbbr(abbr) {
  if (!abbr) return null
  return ABBR_TO_TID[abbr.toUpperCase()] || null
}

/**
 * Get tid from full team name.
 * Use this for migration - convert old name-based data to tid.
 *
 * @param {string} name - Full team name (e.g., "Alabama Crimson Tide")
 * @returns {number|null} Team ID or null
 */
export function getTidFromName(name) {
  if (!name) return null
  return NAME_TO_TID[name] || null
}

/**
 * Initialize a dynasty's team map from the master TEAMS list.
 * Call this when creating a new dynasty.
 *
 * @returns {Object} A copy of TEAMS for the dynasty to own, with byYear initialized
 */
export function initializeDynastyTeams() {
  // Deep copy so each dynasty has its own team data
  const teams = {}
  for (const [tid, team] of Object.entries(TEAMS)) {
    teams[tid] = {
      ...team,
      byYear: {}  // Initialize empty season data
    }
  }
  return teams
}

/**
 * Replace a team slot with a teambuilder team.
 *
 * @param {Object} teams - The dynasty.teams object
 * @param {number} tid - The team slot to replace
 * @param {Object} teambuilderData - The teambuilder team data
 * @returns {Object} Updated teams object
 */
export function setTeambuilderTeam(teams, tid, teambuilderData) {
  if (!teams || !tid || !teambuilderData) return teams

  teams[tid] = {
    tid: parseInt(tid),
    abbr: teambuilderData.abbr || teambuilderData.abbreviation,
    name: teambuilderData.name,
    primaryColor: teambuilderData.primaryColor || teambuilderData.backgroundColor,
    secondaryColor: teambuilderData.secondaryColor || teambuilderData.textColor,
    logo: teambuilderData.logo || teambuilderData.logoUrl,
    isCustom: true
  }

  return teams
}

/**
 * Get sorted list of tids for FBS teams only (for dropdowns).
 * Excludes FCS teams.
 *
 * @param {Object} teams - The dynasty.teams object (or TEAMS)
 * @returns {number[]} Sorted array of tids
 */
export function getFBSTeamTids(teams = TEAMS) {
  return Object.values(teams)
    .filter(team => !team.isFCS)
    .map(team => team.tid)
    .sort((a, b) => {
      // Sort by team name
      const nameA = teams[a]?.name || ''
      const nameB = teams[b]?.name || ''
      return nameA.localeCompare(nameB)
    })
}

/**
 * Get sorted list of all tids including FCS (for scheduling opponents).
 *
 * @param {Object} teams - The dynasty.teams object (or TEAMS)
 * @returns {number[]} Sorted array of all tids
 */
export function getAllTeamTids(teams = TEAMS) {
  return Object.values(teams)
    .map(team => team.tid)
    .sort((a, b) => {
      const nameA = teams[a]?.name || ''
      const nameB = teams[b]?.name || ''
      return nameA.localeCompare(nameB)
    })
}

/**
 * Check if a team is an FCS team.
 *
 * @param {Object} teams - The dynasty.teams object
 * @param {number} tid - Team ID
 * @returns {boolean}
 */
export function isFCSTeam(teams, tid) {
  const team = getTeam(teams, tid)
  return team?.isFCS === true
}

/**
 * Check if a team is a custom/teambuilder team.
 *
 * @param {Object} teams - The dynasty.teams object
 * @param {number} tid - Team ID
 * @returns {boolean}
 */
export function isCustomTeam(teams, tid) {
  const team = getTeam(teams, tid)
  return team?.isCustom === true
}

// ============================================================================
// SEASON DATA HELPERS
// ============================================================================

/**
 * Get a team's data for a specific year.
 * Returns the byYear[year] object, or empty object if not set.
 *
 * @param {Object} teams - The dynasty.teams object
 * @param {number} tid - Team ID
 * @param {number} year - Season year
 * @returns {Object} Season data object (may be empty)
 */
export function getTeamYear(teams, tid, year) {
  if (!teams || !tid || !year) return {}
  const team = teams[tid]
  if (!team) return {}
  return team.byYear?.[year] || {}
}

/**
 * Set a team's data for a specific year.
 * Merges with existing data.
 *
 * @param {Object} teams - The dynasty.teams object
 * @param {number} tid - Team ID
 * @param {number} year - Season year
 * @param {Object} data - Data to merge into the season
 * @returns {Object} Updated teams object
 */
export function setTeamYear(teams, tid, year, data) {
  if (!teams || !tid || !year || !data) return teams

  if (!teams[tid]) return teams
  if (!teams[tid].byYear) teams[tid].byYear = {}
  if (!teams[tid].byYear[year]) teams[tid].byYear[year] = {}

  teams[tid].byYear[year] = {
    ...teams[tid].byYear[year],
    ...data
  }

  return teams
}

/**
 * Get a specific field from a team's season data.
 *
 * @param {Object} teams - The dynasty.teams object
 * @param {number} tid - Team ID
 * @param {number} year - Season year
 * @param {string} field - Field name (e.g., 'schedule', 'teamRatings')
 * @returns {*} The field value or undefined
 */
export function getTeamYearField(teams, tid, year, field) {
  const seasonData = getTeamYear(teams, tid, year)
  return seasonData[field]
}

/**
 * Set a specific field in a team's season data.
 *
 * @param {Object} teams - The dynasty.teams object
 * @param {number} tid - Team ID
 * @param {number} year - Season year
 * @param {string} field - Field name
 * @param {*} value - Value to set
 * @returns {Object} Updated teams object
 */
export function setTeamYearField(teams, tid, year, field, value) {
  return setTeamYear(teams, tid, year, { [field]: value })
}

// ============================================================================
// MIGRATION HELPERS
// ============================================================================

/**
 * Convert an abbreviation to tid, with fallback for missing teams.
 * Use this during migration to safely convert old data.
 *
 * @param {string} abbr - Team abbreviation
 * @param {Object} dynastyTeams - Optional dynasty teams to check for custom abbrs
 * @returns {number|null} Team ID or null if not found
 */
export function migrateAbbrToTid(abbr, dynastyTeams = null) {
  if (!abbr) return null

  // First check static lookup
  const tid = getTidFromAbbr(abbr)
  if (tid) return tid

  // If not found and we have dynasty teams, search for custom team with this abbr
  if (dynastyTeams) {
    for (const [tid, team] of Object.entries(dynastyTeams)) {
      if (team.abbr?.toUpperCase() === abbr.toUpperCase()) {
        return parseInt(tid)
      }
    }
  }

  return null
}

/**
 * Migrate old dynasty data structure to new tid-based structure.
 * Converts all *ByTeamYear[abbr][year] to teams[tid].byYear[year].
 *
 * @param {Object} dynasty - The old dynasty object
 * @returns {Object} Dynasty with migrated teams structure
 */
export function migrateDynastyToTidStructure(dynasty) {
  if (!dynasty) return dynasty

  // Initialize teams if not present
  if (!dynasty.teams) {
    dynasty.teams = initializeDynastyTeams()
  }

  // List of old structures to migrate
  const oldStructures = [
    { old: 'schedulesByTeamYear', new: 'schedule' },
    { old: 'teamRatingsByTeamYear', new: 'teamRatings' },
    { old: 'coachingStaffByTeamYear', new: 'coachingStaff' },
    { old: 'lockedCoachingStaffByTeamYear', new: 'lockedCoachingStaff' },
    { old: 'preseasonSetupByTeamYear', new: 'preseasonSetup' },
    { old: 'recruitingCommitmentsByTeamYear', new: 'recruitingCommitments' },
    { old: 'recruitingClassRankByTeamYear', new: 'recruitingClassRank' },
    { old: 'playersLeavingByTeamYear', new: 'playersLeaving' },
    { old: 'draftResultsByTeamYear', new: 'draftResults' },
    { old: 'transferDestinationsByTeamYear', new: 'transferDestinations' },
    { old: 'portalTransferClassByTeamYear', new: 'portalTransferClass' },
    { old: 'fringeCaseClassByTeamYear', new: 'fringeCaseClass' },
    { old: 'trainingResultsByTeamYear', new: 'trainingResults' },
    { old: 'conferenceChampionshipDataByTeamYear', new: 'conferenceChampionshipData' },
    { old: 'bowlEligibilityDataByTeamYear', new: 'bowlEligibilityData' },
  ]

  for (const { old: oldKey, new: newKey } of oldStructures) {
    if (dynasty[oldKey]) {
      for (const [abbr, yearData] of Object.entries(dynasty[oldKey])) {
        const tid = migrateAbbrToTid(abbr, dynasty.teams)
        if (tid && yearData) {
          for (const [year, data] of Object.entries(yearData)) {
            setTeamYearField(dynasty.teams, tid, parseInt(year), newKey, data)
          }
        }
      }
      // Optionally delete old structure after migration
      // delete dynasty[oldKey]
    }
  }

  return dynasty
}

// ============================================================================
// URL HELPERS - For generating team URLs with tid
// ============================================================================

/**
 * Resolve a team reference to a tid.
 * Accepts either a tid (number), tid string, or abbreviation.
 * This is the key function for URL generation - it normalizes any team reference to a tid.
 *
 * @param {number|string} tidOrAbbr - Team ID (number or string) or abbreviation
 * @param {Object} dynastyTeams - Optional dynasty.teams for custom team lookup
 * @returns {number|null} The tid, or null if not found
 */
export function resolveTid(tidOrAbbr, dynastyTeams = null) {
  if (tidOrAbbr == null) return null

  // If it's already a number, return it
  if (typeof tidOrAbbr === 'number') {
    return tidOrAbbr
  }

  // If it's a string that looks like a number (e.g., "122" from URL param), parse it
  if (typeof tidOrAbbr === 'string' && /^\d+$/.test(tidOrAbbr)) {
    return parseInt(tidOrAbbr, 10)
  }

  // Otherwise treat as abbreviation and convert
  // First try the static lookup
  const tid = getTidFromAbbr(tidOrAbbr)
  if (tid) return tid

  // If not found in static map, check dynasty teams for custom abbreviations
  if (dynastyTeams) {
    for (const [teamTid, team] of Object.entries(dynastyTeams)) {
      if (team.abbr?.toUpperCase() === tidOrAbbr.toUpperCase()) {
        return parseInt(teamTid, 10)
      }
    }
  }

  return null
}

/**
 * Get team abbreviation from tid.
 * Useful for backwards compatibility where abbreviations are still needed.
 *
 * @param {Object} teams - The dynasty.teams object (or TEAMS)
 * @param {number} tid - Team ID
 * @returns {string|null} Team abbreviation or null
 */
export function getAbbrFromTid(teams, tid) {
  if (!teams || tid == null) return null
  const team = teams[tid]
  return team?.abbr || null
}

/**
 * Get team name from tid.
 *
 * @param {Object} teams - The dynasty.teams object (or TEAMS)
 * @param {number} tid - Team ID
 * @returns {string|null} Team name or null
 */
export function getNameFromTid(teams, tid) {
  if (!teams || tid == null) return null
  const team = teams[tid]
  return team?.name || null
}

/**
 * Get team logo from tid.
 *
 * @param {Object} teams - The dynasty.teams object (or TEAMS)
 * @param {number} tid - Team ID
 * @returns {string|null} Team logo URL or null
 */
export function getLogoFromTid(teams, tid) {
  if (!teams || tid == null) return null
  const team = teams[tid]
  return team?.logo || null
}

/**
 * Get team colors from tid.
 *
 * @param {Object} teams - The dynasty.teams object (or TEAMS)
 * @param {number} tid - Team ID
 * @returns {Object} { primary, secondary } colors or defaults
 */
export function getColorsFromTid(teams, tid) {
  if (!teams || tid == null) {
    return { primary: '#374151', secondary: '#FFFFFF' }
  }
  const team = teams[tid]
  return {
    primary: team?.primaryColor || '#374151',
    secondary: team?.secondaryColor || '#FFFFFF'
  }
}

/**
 * Get team by abbreviation from dynasty.teams structure.
 * Useful for looking up opponent teams when you have an abbreviation.
 *
 * @param {Object} teams - The dynasty.teams object (or TEAMS)
 * @param {string} abbr - Team abbreviation
 * @returns {Object|null} Team object or null
 */
export function getTeamByAbbr(teams, abbr) {
  if (!teams || !abbr) return null
  // First try direct ABBR_TO_TID lookup for efficiency
  const tid = ABBR_TO_TID[abbr]
  if (tid && teams[tid]) return teams[tid]
  // Fall back to scanning (handles teambuilder teams with custom abbrs)
  return Object.values(teams).find(t => t.abbr === abbr) || null
}

/**
 * Get team logo by abbreviation from dynasty.teams structure.
 * Convenience function for opponent logo display.
 *
 * @param {Object} teams - The dynasty.teams object (or TEAMS)
 * @param {string} abbr - Team abbreviation
 * @returns {string|null} Logo URL or null
 */
export function getLogoByAbbr(teams, abbr) {
  const team = getTeamByAbbr(teams, abbr)
  return team?.logo || null
}

/**
 * Get team colors by abbreviation from dynasty.teams structure.
 * Convenience function for opponent colors display.
 *
 * @param {Object} teams - The dynasty.teams object (or TEAMS)
 * @param {string} abbr - Team abbreviation
 * @returns {Object} { primary, secondary } colors or defaults
 */
export function getColorsByAbbr(teams, abbr) {
  const team = getTeamByAbbr(teams, abbr)
  return {
    primary: team?.primaryColor || '#374151',
    secondary: team?.secondaryColor || '#FFFFFF'
  }
}

/**
 * Get team name by abbreviation from dynasty.teams structure.
 * Convenience function for opponent name display.
 *
 * @param {Object} teams - The dynasty.teams object (or TEAMS)
 * @param {string} abbr - Team abbreviation
 * @returns {string|null} Team name or null
 */
export function getNameByAbbr(teams, abbr) {
  const team = getTeamByAbbr(teams, abbr)
  return team?.name || null
}
