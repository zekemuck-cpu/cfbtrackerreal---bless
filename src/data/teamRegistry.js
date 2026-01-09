/**
 * Unified Team Registry - Single Source of Truth for Team Data
 *
 * This module consolidates all team data (FBS teams, FCS teams, and teambuilder teams)
 * into a single registry that can be built once when a dynasty loads.
 *
 * Usage:
 *   const registry = buildTeamRegistry(dynasty.customTeams)
 *   const team = registry['BAMA']  // Always works, no customTeams param needed
 *   const logo = team.logo
 *   const colors = { primary: team.primaryColor, secondary: team.secondaryColor }
 */

// ============================================================================
// CONSOLIDATED FBS TEAM DATA
// ============================================================================
// This is the single source of truth for all FBS/FCS teams.
// Each team has: name, abbreviation, primaryColor, secondaryColor, logo, conference, isFCS

export const FBS_TEAMS = {
  "AFA": {
    name: "Air Force Falcons",
    abbreviation: "AFA",
    primaryColor: "#00308f",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/G681EtX.png"
  },
  "AKR": {
    name: "Akron Zips",
    abbreviation: "AKR",
    primaryColor: "#002147",
    secondaryColor: "#918b4c",
    logo: "https://i.imgur.com/6zUeZSt.png"
  },
  "APP": {
    name: "Appalachian State Mountaineers",
    abbreviation: "APP",
    primaryColor: "#222222",
    secondaryColor: "#ffcc00",
    logo: "https://i.imgur.com/CLOVDAA.png"
  },
  "ARIZ": {
    name: "Arizona Wildcats",
    abbreviation: "ARIZ",
    primaryColor: "#AB0520",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/8EkFZUR.png"
  },
  "ARK": {
    name: "Arkansas Razorbacks",
    abbreviation: "ARK",
    primaryColor: "#9D2235",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/Ex6Eytj.png"
  },
  "ARMY": {
    name: "Army Black Knights",
    abbreviation: "ARMY",
    primaryColor: "#000000",
    secondaryColor: "#d3bc8d",
    logo: "https://i.imgur.com/ItRoAOS.png"
  },
  "ARST": {
    name: "Arkansas State Red Wolves",
    abbreviation: "ARST",
    primaryColor: "#cc092f",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/oIpVKLR.png"
  },
  "ASU": {
    name: "Arizona State Sun Devils",
    abbreviation: "ASU",
    primaryColor: "#990033",
    secondaryColor: "#FFB310",
    logo: "https://i.imgur.com/j2rLkcJ.png"
  },
  "AUB": {
    name: "Auburn Tigers",
    abbreviation: "AUB",
    primaryColor: "#0C2340",
    secondaryColor: "#F26522",
    logo: "https://i.imgur.com/W9xdTG6.png"
  },
  "BALL": {
    name: "Ball State Cardinals",
    abbreviation: "BALL",
    primaryColor: "#BA0C2F",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/CYSacTE.png"
  },
  "BAMA": {
    name: "Alabama Crimson Tide",
    abbreviation: "BAMA",
    primaryColor: "#9e1b32",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/GSZQpoc.png"
  },
  "BC": {
    name: "Boston College Eagles",
    abbreviation: "BC",
    primaryColor: "#910039",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/aTfqVvH.png"
  },
  "BGSU": {
    name: "Bowling Green Falcons",
    abbreviation: "BGSU",
    primaryColor: "#4F2C1D",
    secondaryColor: "#FE5000",
    logo: "https://i.imgur.com/VfeB3Og.png"
  },
  "BOIS": {
    name: "Boise State Broncos",
    abbreviation: "BOIS",
    primaryColor: "#09347A",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/0wWZR5S.png"
  },
  "BU": {
    name: "Baylor Bears",
    abbreviation: "BU",
    primaryColor: "#003015",
    secondaryColor: "#fecb00",
    logo: "https://i.imgur.com/wXkLNMi.png"
  },
  "BUFF": {
    name: "Buffalo Bulls",
    abbreviation: "BUFF",
    primaryColor: "#005bbb",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/E8Xk6Rx.png"
  },
  "BYU": {
    name: "Brigham Young Cougars",
    abbreviation: "BYU",
    primaryColor: "#002255",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/lI8iDxc.png"
  },
  "CAL": {
    name: "California Golden Bears",
    abbreviation: "CAL",
    primaryColor: "#041E42",
    secondaryColor: "#FFC72C",
    logo: "https://i.imgur.com/zMvNh7F.png"
  },
  "CCU": {
    name: "Coastal Carolina Chanticleers",
    abbreviation: "CCU",
    primaryColor: "#006F71",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/QdyWaWM.png"
  },
  "CHAR": {
    name: "Charlotte 49ers",
    abbreviation: "CHAR",
    primaryColor: "#046a38",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/UbS3QQ1.png"
  },
  "CLEM": {
    name: "Clemson Tigers",
    abbreviation: "CLEM",
    primaryColor: "#F56600",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/pROGKze.png"
  },
  "CMU": {
    name: "Central Michigan Chippewas",
    abbreviation: "CMU",
    primaryColor: "#6a0032",
    secondaryColor: "#ffc82e",
    logo: "https://i.imgur.com/Cbcjcx2.png"
  },
  "COLO": {
    name: "Colorado Buffaloes",
    abbreviation: "COLO",
    primaryColor: "#000000",
    secondaryColor: "#CFB87C",
    logo: "https://i.imgur.com/pRWGpft.png"
  },
  "CONN": {
    name: "Connecticut Huskies",
    abbreviation: "CONN",
    primaryColor: "#000E2F",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/jQd2zR9.png"
  },
  "CSU": {
    name: "Colorado State Rams",
    abbreviation: "CSU",
    primaryColor: "#1E4D2B",
    secondaryColor: "#C8C372",
    logo: "https://i.imgur.com/AD1Z03j.png"
  },
  "DEL": {
    name: "Delaware Fightin' Blue Hens",
    abbreviation: "DEL",
    primaryColor: "#00539F",
    secondaryColor: "#FFDD31",
    logo: "https://i.imgur.com/uj7mkBT.png"
  },
  "DUKE": {
    name: "Duke Blue Devils",
    abbreviation: "DUKE",
    primaryColor: "#001A57",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/gLVKep0.png"
  },
  "ECU": {
    name: "East Carolina Pirates",
    abbreviation: "ECU",
    primaryColor: "#592A8A",
    secondaryColor: "#FDC82F",
    logo: "https://i.imgur.com/V0qdjCf.png"
  },
  "EMU": {
    name: "Eastern Michigan Eagles",
    abbreviation: "EMU",
    primaryColor: "#006633",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/gWngHs9.png"
  },
  "FAU": {
    name: "Florida Atlantic Owls",
    abbreviation: "FAU",
    primaryColor: "#003366",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/DkHBjJl.png"
  },
  "FIU": {
    name: "Florida International Panthers",
    abbreviation: "FIU",
    primaryColor: "#081E3F",
    secondaryColor: "#B6862C",
    logo: "https://i.imgur.com/HYgpDWB.png"
  },
  "FCSE": {
    name: "FCS East Judicials",
    abbreviation: "FCSE",
    primaryColor: "#2F1936",
    secondaryColor: "#8E85A1",
    logo: "https://i.imgur.com/eFyXxwT.png",
    isFCS: true
  },
  "FCSM": {
    name: "FCS Midwest Rebels",
    abbreviation: "FCSM",
    primaryColor: "#91ABC7",
    secondaryColor: "#1a1a1a",
    logo: "https://i.imgur.com/NOJOPG8.png",
    isFCS: true
  },
  "FCSN": {
    name: "FCS Northwest Stallions",
    abbreviation: "FCSN",
    primaryColor: "#BFA544",
    secondaryColor: "#477F62",
    logo: "https://i.imgur.com/uBvbn1s.png",
    isFCS: true
  },
  "FCSW": {
    name: "FCS West Titans",
    abbreviation: "FCSW",
    primaryColor: "#462E6A",
    secondaryColor: "#AF9458",
    logo: "https://i.imgur.com/Y8A8u0g.png",
    isFCS: true
  },
  "FLA": {
    name: "Florida Gators",
    abbreviation: "FLA",
    primaryColor: "#0021a5",
    secondaryColor: "#FA4616",
    logo: "https://i.imgur.com/rMdZfeC.png"
  },
  "FRES": {
    name: "Fresno State Bulldogs",
    abbreviation: "FRES",
    primaryColor: "#C41230",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/g1dJuYI.png"
  },
  "FSU": {
    name: "Florida State Seminoles",
    abbreviation: "FSU",
    primaryColor: "#782F40",
    secondaryColor: "#CEB888",
    logo: "https://i.imgur.com/sVMLEHK.png"
  },
  "GASO": {
    name: "Georgia Southern Eagles",
    abbreviation: "GASO",
    primaryColor: "#011e41",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/mdmOccs.png"
  },
  "GSU": {
    name: "Georgia State Panthers",
    abbreviation: "GSU",
    primaryColor: "#0039A6",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/XO5zyB9.png"
  },
  "GT": {
    name: "Georgia Tech Yellow Jackets",
    abbreviation: "GT",
    primaryColor: "#C59353",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/Ysz59VM.png"
  },
  "HAW": {
    name: "Hawaii Rainbow Warriors",
    abbreviation: "HAW",
    primaryColor: "#024731",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/4Afe87s.png"
  },
  "ILL": {
    name: "Illinois Fighting Illini",
    abbreviation: "ILL",
    primaryColor: "#e04e39",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/vklZme6.png"
  },
  "IOWA": {
    name: "Iowa Hawkeyes",
    abbreviation: "IOWA",
    primaryColor: "#000000",
    secondaryColor: "#FFE100",
    logo: "https://i.imgur.com/ydHy2Fe.png"
  },
  "ISU": {
    name: "Iowa State Cyclones",
    abbreviation: "ISU",
    primaryColor: "#a6192e",
    secondaryColor: "#FDC82F",
    logo: "https://i.imgur.com/VubsqM8.png"
  },
  "IU": {
    name: "Indiana Hoosiers",
    abbreviation: "IU",
    primaryColor: "#990000",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/2b8EE6q.png"
  },
  "JKST": {
    name: "Jacksonville State Gamecocks",
    abbreviation: "JKST",
    primaryColor: "#CC0000",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/YQ9UB5F.png"
  },
  "JMU": {
    name: "James Madison Dukes",
    abbreviation: "JMU",
    primaryColor: "#450084",
    secondaryColor: "#CBB677",
    logo: "https://i.imgur.com/rJnhTUG.png"
  },
  "KENN": {
    name: "Kennesaw State Owls",
    abbreviation: "KENN",
    primaryColor: "#FDBB30",
    secondaryColor: "#0B1315",
    logo: "https://i.imgur.com/kXNSolO.png"
  },
  "KENT": {
    name: "Kent State Golden Flashes",
    abbreviation: "KENT",
    primaryColor: "#002664",
    secondaryColor: "#EAAB00",
    logo: "https://i.imgur.com/GF7m8eE.png"
  },
  "KSU": {
    name: "Kansas State Wildcats",
    abbreviation: "KSU",
    primaryColor: "#512888",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/9QJFeWa.png"
  },
  "KU": {
    name: "Kansas Jayhawks",
    abbreviation: "KU",
    primaryColor: "#0051BA",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/CDxaFKY.png"
  },
  "LIB": {
    name: "Liberty Flames",
    abbreviation: "LIB",
    primaryColor: "#002D62",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/HbtnueZ.png"
  },
  "LOU": {
    name: "Louisville Cardinals",
    abbreviation: "LOU",
    primaryColor: "#AD0000",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/9sbwLXF.png"
  },
  "LSU": {
    name: "LSU Tigers",
    abbreviation: "LSU",
    primaryColor: "#582c83",
    secondaryColor: "#ffc72c",
    logo: "https://i.imgur.com/VS17Nsy.png"
  },
  "LT": {
    name: "Louisiana Tech Bulldogs",
    abbreviation: "LT",
    primaryColor: "#003087",
    secondaryColor: "#CB333B",
    logo: "https://i.imgur.com/fTMLVzi.png"
  },
  "M-OH": {
    name: "Miami Redhawks",
    abbreviation: "M-OH",
    primaryColor: "#B61E2E",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/h3YybDS.png"
  },
  "MASS": {
    name: "Massachusetts Minutemen",
    abbreviation: "MASS",
    primaryColor: "#881c1c",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/DpEq0GQ.png"
  },
  "MEM": {
    name: "Memphis Tigers",
    abbreviation: "MEM",
    primaryColor: "#0D3182",
    secondaryColor: "#888C8F",
    logo: "https://i.imgur.com/KMyq79Q.png"
  },
  "MIA": {
    name: "Miami Hurricanes",
    abbreviation: "MIA",
    primaryColor: "#005030",
    secondaryColor: "#f47321",
    logo: "https://i.imgur.com/SVtR4oY.png"
  },
  "MICH": {
    name: "Michigan Wolverines",
    abbreviation: "MICH",
    primaryColor: "#ffcb05",
    secondaryColor: "#00274c",
    logo: "https://i.imgur.com/F611D29.png"
  },
  "MINN": {
    name: "Minnesota Golden Gophers",
    abbreviation: "MINN",
    primaryColor: "#7a0019",
    secondaryColor: "#ffcc33",
    logo: "https://i.imgur.com/oiN1rtG.png"
  },
  "MISS": {
    name: "Ole Miss Rebels",
    abbreviation: "MISS",
    primaryColor: "#00205b",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/nlFnhFv.png"
  },
  "MIZ": {
    name: "Missouri Tigers",
    abbreviation: "MIZ",
    primaryColor: "#000000",
    secondaryColor: "#F1B82D",
    logo: "https://i.imgur.com/SwMezGT.png"
  },
  "MRSH": {
    name: "Marshall Thundering Herd",
    abbreviation: "MRSH",
    primaryColor: "#0BB140",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/kznyRSc.png"
  },
  "MSST": {
    name: "Mississippi State Bulldogs",
    abbreviation: "MSST",
    primaryColor: "#660000",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/MIk8N5r.png"
  },
  "MSU": {
    name: "Michigan State Spartans",
    abbreviation: "MSU",
    primaryColor: "#18453B",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/m4QaHmu.png"
  },
  "MTSU": {
    name: "Middle Tennessee State Blue Raiders",
    abbreviation: "MTSU",
    primaryColor: "#0066CC",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/zp6fnpe.png"
  },
  "MZST": {
    name: "Missouri State Bears",
    abbreviation: "MZST",
    primaryColor: "#5E0009",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/gybvEes.png"
  },
  "NAVY": {
    name: "Navy Midshipmen",
    abbreviation: "NAVY",
    primaryColor: "#00205b",
    secondaryColor: "#c5b783",
    logo: "https://i.imgur.com/1OaGRGp.png"
  },
  "NCST": {
    name: "North Carolina State Wolfpack",
    abbreviation: "NCST",
    primaryColor: "#CC0000",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/acrRSno.png"
  },
  "ND": {
    name: "Notre Dame Fighting Irish",
    abbreviation: "ND",
    primaryColor: "#0C2340",
    secondaryColor: "#C99700",
    logo: "https://i.imgur.com/v5Jt5U0.png"
  },
  "NEB": {
    name: "Nebraska Cornhuskers",
    abbreviation: "NEB",
    primaryColor: "#e41c38",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/2Oaz93O.png"
  },
  "NEV": {
    name: "Nevada Wolf Pack",
    abbreviation: "NEV",
    primaryColor: "#003366",
    secondaryColor: "#807f84",
    logo: "https://i.imgur.com/fknfwmy.png"
  },
  "NIU": {
    name: "Northern Illinois Huskies",
    abbreviation: "NIU",
    primaryColor: "#ba0c2f",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/rB45HBn.png"
  },
  "NMSU": {
    name: "New Mexico State Aggies",
    abbreviation: "NMSU",
    primaryColor: "#8c0b42",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/sdRGddP.png"
  },
  "NU": {
    name: "Northwestern Wildcats",
    abbreviation: "NU",
    primaryColor: "#4E2A84",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/XJ90C3s.png"
  },
  "ODU": {
    name: "Old Dominion Monarchs",
    abbreviation: "ODU",
    primaryColor: "#05344C",
    secondaryColor: "#7c878e",
    logo: "https://i.imgur.com/mybV1nZ.png"
  },
  "OHIO": {
    name: "Ohio Bobcats",
    abbreviation: "OHIO",
    primaryColor: "#00694E",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/c0cvsse.png"
  },
  "OKST": {
    name: "Oklahoma State Cowboys",
    abbreviation: "OKST",
    primaryColor: "#FF7300",
    secondaryColor: "#000000",
    logo: "https://i.imgur.com/wnZzORg.png"
  },
  "ORE": {
    name: "Oregon Ducks",
    abbreviation: "ORE",
    primaryColor: "#154733",
    secondaryColor: "#FEE123",
    logo: "https://i.imgur.com/agCeDq7.png"
  },
  "ORST": {
    name: "Oregon State Beavers",
    abbreviation: "ORST",
    primaryColor: "#C34500",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/Etg1WG6.png"
  },
  "OSU": {
    name: "Ohio State Buckeyes",
    abbreviation: "OSU",
    primaryColor: "#bb0000",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/l4sb8kJ.png"
  },
  "OU": {
    name: "Oklahoma Sooners",
    abbreviation: "OU",
    primaryColor: "#841617",
    secondaryColor: "#FDF9D8",
    logo: "https://i.imgur.com/2xQtIAj.png"
  },
  "PITT": {
    name: "Pittsburgh Panthers",
    abbreviation: "PITT",
    primaryColor: "#1c2957",
    secondaryColor: "#cdb87d",
    logo: "https://i.imgur.com/iOm9P7S.png"
  },
  "PSU": {
    name: "Penn State Nittany Lions",
    abbreviation: "PSU",
    primaryColor: "#041e42",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/9xn2tA1.png"
  },
  "PUR": {
    name: "Purdue Boilermakers",
    abbreviation: "PUR",
    primaryColor: "#000000",
    secondaryColor: "#CEB888",
    logo: "https://i.imgur.com/RVSg0ZT.png"
  },
  "RICE": {
    name: "Rice Owls",
    abbreviation: "RICE",
    primaryColor: "#002469",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/9E8LJDL.png"
  },
  "RUTG": {
    name: "Rutgers Scarlet Knights",
    abbreviation: "RUTG",
    primaryColor: "#d21034",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/KqmENFW.png"
  },
  "SCAR": {
    name: "South Carolina Gamecocks",
    abbreviation: "SCAR",
    primaryColor: "#73000A",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/lraZiou.png"
  },
  "SDSU": {
    name: "San Diego State Aztecs",
    abbreviation: "SDSU",
    primaryColor: "#C41230",
    secondaryColor: "#000000",
    logo: "https://i.imgur.com/ntHVrPq.png"
  },
  "SHSU": {
    name: "Sam Houston State Bearkats",
    abbreviation: "SHSU",
    primaryColor: "#FE5100",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/f4L04yr.png"
  },
  "SJSU": {
    name: "San Jose State Spartans",
    abbreviation: "SJSU",
    primaryColor: "#0055A2",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/mEe0roq.png"
  },
  "SMU": {
    name: "SMU Mustangs",
    abbreviation: "SMU",
    primaryColor: "#354ca1",
    secondaryColor: "#cd2027",
    logo: "https://i.imgur.com/kW6uKaE.png"
  },
  "STAN": {
    name: "Stanford Cardinal",
    abbreviation: "STAN",
    primaryColor: "#8C1515",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/ZVUGplg.png"
  },
  "SYR": {
    name: "Syracuse Orange",
    abbreviation: "SYR",
    primaryColor: "#D44500",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/RUwuZQ2.png"
  },
  "TAMU": {
    name: "Texas A&M Aggies",
    abbreviation: "TAMU",
    primaryColor: "#500000",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/e0PJnKV.png"
  },
  "TCU": {
    name: "TCU Horned Frogs",
    abbreviation: "TCU",
    primaryColor: "#4d1979",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/3tf2B9g.png"
  },
  "TEM": {
    name: "Temple Owls",
    abbreviation: "TEM",
    primaryColor: "#990033",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/B1iv8DV.png"
  },
  "TEX": {
    name: "Texas Longhorns",
    abbreviation: "TEX",
    primaryColor: "#BF5700",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/q4vT2Mk.png"
  },
  "TLSA": {
    name: "Tulsa Golden Hurricane",
    abbreviation: "TLSA",
    primaryColor: "#c5b783",
    secondaryColor: "#002d72",
    logo: "https://i.imgur.com/0SmXB3e.png"
  },
  "TOL": {
    name: "Toledo Rockets",
    abbreviation: "TOL",
    primaryColor: "#002569",
    secondaryColor: "#ffce00",
    logo: "https://i.imgur.com/PVqgA77.png"
  },
  "TROY": {
    name: "Troy Trojans",
    abbreviation: "TROY",
    primaryColor: "#862633",
    secondaryColor: "#8a8d8f",
    logo: "https://i.imgur.com/asolJAj.png"
  },
  "TTU": {
    name: "Texas Tech Red Raiders",
    abbreviation: "TTU",
    primaryColor: "#CC0000",
    secondaryColor: "#000000",
    logo: "https://i.imgur.com/3hII0Qo.png"
  },
  "TULN": {
    name: "Tulane Green Wave",
    abbreviation: "TULN",
    primaryColor: "#005837",
    secondaryColor: "#0082ba",
    logo: "https://i.imgur.com/SYyJ9OY.png"
  },
  "TXST": {
    name: "Texas State Bobcats",
    abbreviation: "TXST",
    primaryColor: "#501214",
    secondaryColor: "#8D734A",
    logo: "https://i.imgur.com/lGsXqwz.png"
  },
  "UAB": {
    name: "UAB Blazers",
    abbreviation: "UAB",
    primaryColor: "#006341",
    secondaryColor: "#CC8A00",
    logo: "https://i.imgur.com/F0k67aG.png"
  },
  "UC": {
    name: "Cincinnati Bearcats",
    abbreviation: "UC",
    primaryColor: "#000000",
    secondaryColor: "#E00122",
    logo: "https://i.imgur.com/NYT8eiL.png"
  },
  "UCF": {
    name: "UCF Knights",
    abbreviation: "UCF",
    primaryColor: "#000000",
    secondaryColor: "#BA9B37",
    logo: "https://i.imgur.com/LfBAhJl.png"
  },
  "UCLA": {
    name: "UCLA Bruins",
    abbreviation: "UCLA",
    primaryColor: "#0072ce",
    secondaryColor: "#ffc72c",
    logo: "https://i.imgur.com/h3jGxhG.png"
  },
  "UGA": {
    name: "Georgia Bulldogs",
    abbreviation: "UGA",
    primaryColor: "#DA291C",
    secondaryColor: "#000000",
    logo: "https://i.imgur.com/SWGe1k7.png"
  },
  "UH": {
    name: "Houston Cougars",
    abbreviation: "UH",
    primaryColor: "#C92839",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/8gWIuq4.png"
  },
  "UK": {
    name: "Kentucky Wildcats",
    abbreviation: "UK",
    primaryColor: "#0033A0",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/M7PmVR7.png"
  },
  "UL": {
    name: "Lafayette Ragin' Cajuns",
    abbreviation: "UL",
    primaryColor: "#ce181e",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/UDJsamv.png"
  },
  "ULM": {
    name: "Monroe Warhawks",
    abbreviation: "ULM",
    primaryColor: "#800029",
    secondaryColor: "#bd955a",
    logo: "https://i.imgur.com/O0Knoh1.png"
  },
  "UMD": {
    name: "Maryland Terrapins",
    abbreviation: "UMD",
    primaryColor: "#c8102e",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/AHZmTu4.png"
  },
  "UNC": {
    name: "North Carolina Tar Heels",
    abbreviation: "UNC",
    primaryColor: "#7BAFD4",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/uQwBbAg.png"
  },
  "UNLV": {
    name: "UNLV Rebels",
    abbreviation: "UNLV",
    primaryColor: "#B10202",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/trPAWON.png"
  },
  "UNM": {
    name: "New Mexico Lobos",
    abbreviation: "UNM",
    primaryColor: "#B71234",
    secondaryColor: "#C3C8C8",
    logo: "https://i.imgur.com/PgMCRT5.png"
  },
  "UNT": {
    name: "North Texas Mean Green",
    abbreviation: "UNT",
    primaryColor: "#00853E",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/FJu27tr.png"
  },
  "USA": {
    name: "South Alabama Jaguars",
    abbreviation: "USA",
    primaryColor: "#00205B",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/VOI9pnS.png"
  },
  "USC": {
    name: "USC Trojans",
    abbreviation: "USC",
    primaryColor: "#990000",
    secondaryColor: "#FFCC00",
    logo: "https://i.imgur.com/Fs85ZZ5.png"
  },
  "USF": {
    name: "South Florida Bulls",
    abbreviation: "USF",
    primaryColor: "#006747",
    secondaryColor: "#CFC493",
    logo: "https://i.imgur.com/cv0dFiI.png"
  },
  "USM": {
    name: "Southern Mississippi Golden Eagles",
    abbreviation: "USM",
    primaryColor: "#000000",
    secondaryColor: "#FDC737",
    logo: "https://i.imgur.com/hMPAEnR.png"
  },
  "USU": {
    name: "Utah State Aggies",
    abbreviation: "USU",
    primaryColor: "#0F2439",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/bOJ7lDL.png"
  },
  "UT": {
    name: "Tennessee Volunteers",
    abbreviation: "UT",
    primaryColor: "#FF8200",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/bZWLkmZ.png"
  },
  "UTAH": {
    name: "Utah Utes",
    abbreviation: "UTAH",
    primaryColor: "#CC0000",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/tkZnRXA.png"
  },
  "UTEP": {
    name: "UTEP Miners",
    abbreviation: "UTEP",
    primaryColor: "#002147",
    secondaryColor: "#FF5600",
    logo: "https://i.imgur.com/BlsFSLQ.png"
  },
  "UTSA": {
    name: "UTSA Roadrunners",
    abbreviation: "UTSA",
    primaryColor: "#0c2340",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/OmMX64U.png"
  },
  "UVA": {
    name: "Virginia Cavaliers",
    abbreviation: "UVA",
    primaryColor: "#041e42",
    secondaryColor: "#fa4616",
    logo: "https://i.imgur.com/KJOkotE.png"
  },
  "VAN": {
    name: "Vanderbilt Commodores",
    abbreviation: "VAN",
    primaryColor: "#000000",
    secondaryColor: "#997F3D",
    logo: "https://i.imgur.com/2iN56zn.png"
  },
  "VT": {
    name: "Virginia Tech Hokies",
    abbreviation: "VT",
    primaryColor: "#660000",
    secondaryColor: "#FF6600",
    logo: "https://i.imgur.com/FDlQUs2.png"
  },
  "WAKE": {
    name: "Wake Forest Demon Deacons",
    abbreviation: "WAKE",
    primaryColor: "#000000",
    secondaryColor: "#9E7E38",
    logo: "https://i.imgur.com/rSbzrAk.png"
  },
  "WASH": {
    name: "Washington Huskies",
    abbreviation: "WASH",
    primaryColor: "#363c74",
    secondaryColor: "#e8d3a2",
    logo: "https://i.imgur.com/HYesxla.png"
  },
  "WIS": {
    name: "Wisconsin Badgers",
    abbreviation: "WIS",
    primaryColor: "#c5050c",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/qEPZKqG.png"
  },
  "WKU": {
    name: "Western Kentucky Hilltoppers",
    abbreviation: "WKU",
    primaryColor: "#B01E24",
    secondaryColor: "#FFFFFF",
    logo: "https://i.imgur.com/xgwRtOn.png"
  },
  "WMU": {
    name: "Western Michigan Broncos",
    abbreviation: "WMU",
    primaryColor: "#6c4023",
    secondaryColor: "#b5a167",
    logo: "https://i.imgur.com/9NB1uSz.png"
  },
  "WSU": {
    name: "Washington State Cougars",
    abbreviation: "WSU",
    primaryColor: "#981e32",
    secondaryColor: "#5e6a71",
    logo: "https://i.imgur.com/ugQGdDM.png"
  },
  "WVU": {
    name: "West Virginia Mountaineers",
    abbreviation: "WVU",
    primaryColor: "#002855",
    secondaryColor: "#EAAA00",
    logo: "https://i.imgur.com/U1uvExa.png"
  },
  "WYO": {
    name: "Wyoming Cowboys",
    abbreviation: "WYO",
    primaryColor: "#492f24",
    secondaryColor: "#ffc425",
    logo: "https://i.imgur.com/Pjw5U7w.png"
  }
}

// Build a reverse lookup: full name -> abbreviation
const NAME_TO_ABBR = {}
for (const [abbr, team] of Object.entries(FBS_TEAMS)) {
  NAME_TO_ABBR[team.name] = abbr
}

// ============================================================================
// REGISTRY BUILDER
// ============================================================================

/**
 * Builds a unified team registry that merges FBS teams with teambuilder teams.
 *
 * @param {Object} customTeams - The dynasty's customTeams object (can be null/undefined)
 * @returns {Object} A registry object where each key is an abbreviation
 *
 * The registry handles:
 * 1. All FBS teams (except those replaced by teambuilder teams)
 * 2. Teambuilder teams with their custom data
 * 3. Backwards compatibility: replaced team abbreviations resolve to teambuilder team
 */
export function buildTeamRegistry(customTeams = null) {
  const registry = {}

  // Get set of replaced team abbreviations
  const replacedAbbrs = new Set()
  if (customTeams) {
    for (const ct of Object.values(customTeams)) {
      if (ct.replacesTeam) {
        replacedAbbrs.add(ct.replacesTeam)
      }
    }
  }

  // Add all FBS teams except those replaced
  for (const [abbr, team] of Object.entries(FBS_TEAMS)) {
    if (!replacedAbbrs.has(abbr)) {
      registry[abbr] = {
        ...team,
        isCustom: false
      }
    }
  }

  // Add teambuilder teams
  if (customTeams) {
    for (const [abbr, ct] of Object.entries(customTeams)) {
      const teamData = {
        name: ct.name,
        abbreviation: abbr,
        primaryColor: ct.backgroundColor || ct.primaryColor,
        secondaryColor: ct.textColor || ct.secondaryColor,
        logo: ct.logoUrl,
        isCustom: true,
        replacesTeam: ct.replacesTeam
      }

      // Add under the teambuilder abbreviation
      registry[abbr] = teamData

      // ALSO map the replaced abbreviation to the teambuilder team (backwards compat)
      if (ct.replacesTeam) {
        registry[ct.replacesTeam] = {
          ...teamData,
          _resolvedFrom: ct.replacesTeam  // Track that this was a redirect
        }
      }
    }
  }

  return registry
}

// ============================================================================
// SIMPLE LOOKUP FUNCTIONS (for use with registry)
// ============================================================================

/**
 * Get team data from the registry by abbreviation.
 * This is the primary lookup function - use this for everything.
 *
 * @param {Object} registry - The team registry built from buildTeamRegistry()
 * @param {string} abbr - Team abbreviation
 * @returns {Object|null} Team data object or null if not found
 */
export function getTeamFromRegistry(registry, abbr) {
  if (!registry || !abbr) return null
  return registry[abbr.toUpperCase()] || null
}

/**
 * Get abbreviation from full team name.
 *
 * @param {Object} registry - The team registry
 * @param {string} name - Full team name (e.g., "Alabama Crimson Tide")
 * @returns {string|null} Team abbreviation or null
 */
export function getAbbrFromName(registry, name) {
  if (!registry || !name) return null

  // Search registry for matching name
  for (const [abbr, team] of Object.entries(registry)) {
    if (team.name === name) {
      return abbr
    }
  }

  // Fall back to static lookup (for names not in registry)
  return NAME_TO_ABBR[name] || null
}

/**
 * Get sorted list of team abbreviations for dropdowns.
 * Excludes FCS teams.
 *
 * @param {Object} registry - The team registry
 * @returns {string[]} Sorted array of abbreviations
 */
export function getSelectableTeams(registry) {
  if (!registry) {
    // Fallback: return FBS teams excluding FCS
    return Object.keys(FBS_TEAMS)
      .filter(abbr => !FBS_TEAMS[abbr].isFCS)
      .sort()
  }

  return Object.keys(registry)
    .filter(abbr => {
      const team = registry[abbr]
      // Exclude FCS teams and exclude "resolved from" entries (avoid duplicates)
      return !team.isFCS && !team._resolvedFrom
    })
    .sort()
}

/**
 * Get sorted list of all team abbreviations including FCS (for scheduling).
 *
 * @param {Object} registry - The team registry
 * @returns {string[]} Sorted array of all abbreviations
 */
export function getAllTeams(registry) {
  if (!registry) {
    return Object.keys(FBS_TEAMS).sort()
  }

  return Object.keys(registry)
    .filter(abbr => !registry[abbr]._resolvedFrom)  // Avoid duplicates
    .sort()
}

/**
 * Check if a team is an FCS team.
 *
 * @param {Object} registry - The team registry
 * @param {string} abbr - Team abbreviation
 * @returns {boolean}
 */
export function isFCS(registry, abbr) {
  const team = getTeamFromRegistry(registry, abbr)
  return team?.isFCS === true
}

/**
 * Check if a team is a custom/teambuilder team.
 *
 * @param {Object} registry - The team registry
 * @param {string} abbr - Team abbreviation
 * @returns {boolean}
 */
export function isCustomTeam(registry, abbr) {
  const team = getTeamFromRegistry(registry, abbr)
  return team?.isCustom === true
}

// ============================================================================
// LEGACY COMPATIBILITY LAYER
// ============================================================================
// These functions provide the old API but use the new registry internally.
// They exist so we can migrate gradually.

/**
 * Get team by abbreviation (legacy compatibility).
 * Works with or without registry - falls back to FBS_TEAMS.
 */
export function getTeamByAbbr(abbr, registry = null) {
  if (registry) {
    return getTeamFromRegistry(registry, abbr)
  }
  return FBS_TEAMS[abbr?.toUpperCase()] || null
}

/**
 * Get team name by abbreviation (legacy compatibility).
 */
export function getTeamNameByAbbr(abbr, registry = null) {
  const team = getTeamByAbbr(abbr, registry)
  return team?.name || abbr
}

/**
 * Get team logo by abbreviation (legacy compatibility).
 */
export function getTeamLogoByAbbr(abbr, registry = null) {
  const team = getTeamByAbbr(abbr, registry)
  return team?.logo || null
}

/**
 * Get team colors by abbreviation (legacy compatibility).
 */
export function getTeamColorsByAbbr(abbr, registry = null) {
  const team = getTeamByAbbr(abbr, registry)
  if (!team) return { primary: "#ea580c", secondary: "#FFFFFF" }
  return {
    primary: team.primaryColor,
    secondary: team.secondaryColor
  }
}
