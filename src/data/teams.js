import { teamAbbreviations } from './teamAbbreviations'
import { getAbbrFromTeamName, TEAMS as TEAMS_REGISTRY } from './teamRegistry'
import { espnTeamIds } from './espnTeamIds'

// Team logo URLs (Imgur hosted)
const teamLogos = {
  "Air Force Falcons": "https://i.imgur.com/G681EtX.png",
  "Akron Zips": "https://i.imgur.com/6zUeZSt.png",
  "Alabama Crimson Tide": "https://i.imgur.com/GSZQpoc.png",
  "Appalachian State Mountaineers": "https://i.imgur.com/CLOVDAA.png",
  "Arizona State Sun Devils": "https://i.imgur.com/j2rLkcJ.png",
  "Arizona Wildcats": "https://i.imgur.com/8EkFZUR.png",
  "Arkansas Razorbacks": "https://i.imgur.com/Ex6Eytj.png",
  "Arkansas State Red Wolves": "https://i.imgur.com/oIpVKLR.png",
  "Army Black Knights": "https://i.imgur.com/ItRoAOS.png",
  "Auburn Tigers": "https://i.imgur.com/W9xdTG6.png",
  "Ball State Cardinals": "https://i.imgur.com/CYSacTE.png",
  "Baylor Bears": "https://i.imgur.com/wXkLNMi.png",
  "Boise State Broncos": "https://i.imgur.com/0wWZR5S.png",
  "Boston College Eagles": "https://i.imgur.com/aTfqVvH.png",
  "Bowling Green Falcons": "https://i.imgur.com/VfeB3Og.png",
  "Brigham Young Cougars": "https://i.imgur.com/lI8iDxc.png",
  "Buffalo Bulls": "https://i.imgur.com/E8Xk6Rx.png",
  "California Golden Bears": "https://i.imgur.com/zMvNh7F.png",
  "Central Michigan Chippewas": "https://i.imgur.com/Cbcjcx2.png",
  "Charlotte 49ers": "https://i.imgur.com/UbS3QQ1.png",
  "Cincinnati Bearcats": "https://i.imgur.com/NYT8eiL.png",
  "Clemson Tigers": "https://i.imgur.com/pROGKze.png",
  "Coastal Carolina Chanticleers": "https://i.imgur.com/QdyWaWM.png",
  "Colorado Buffaloes": "https://i.imgur.com/pRWGpft.png",
  "Colorado State Rams": "https://i.imgur.com/AD1Z03j.png",
  "Connecticut Huskies": "https://i.imgur.com/jQd2zR9.png",
  "Delaware Fightin' Blue Hens": "https://i.imgur.com/uj7mkBT.png",
  "Duke Blue Devils": "https://i.imgur.com/gLVKep0.png",
  "East Carolina Pirates": "https://i.imgur.com/V0qdjCf.png",
  "Eastern Michigan Eagles": "https://i.imgur.com/gWngHs9.png",
  "Florida Atlantic Owls": "https://i.imgur.com/DkHBjJl.png",
  "Florida Gators": "https://i.imgur.com/rMdZfeC.png",
  "Florida International Panthers": "https://i.imgur.com/HYgpDWB.png",
  "Florida State Seminoles": "https://i.imgur.com/sVMLEHK.png",
  "Fresno State Bulldogs": "https://i.imgur.com/g1dJuYI.png",
  "Georgia Bulldogs": "https://i.imgur.com/SWGe1k7.png",
  "Georgia Southern Eagles": "https://i.imgur.com/mdmOccs.png",
  "Georgia State Panthers": "https://i.imgur.com/XO5zyB9.png",
  "Georgia Tech Yellow Jackets": "https://i.imgur.com/Ysz59VM.png",
  "Hawaii Rainbow Warriors": "https://i.imgur.com/4Afe87s.png",
  "Houston Cougars": "https://i.imgur.com/8gWIuq4.png",
  "Illinois Fighting Illini": "https://i.imgur.com/vklZme6.png",
  "Indiana Hoosiers": "https://i.imgur.com/2b8EE6q.png",
  "Iowa Hawkeyes": "https://i.imgur.com/ydHy2Fe.png",
  "Iowa State Cyclones": "https://i.imgur.com/VubsqM8.png",
  "Jacksonville State Gamecocks": "https://i.imgur.com/YQ9UB5F.png",
  "James Madison Dukes": "https://i.imgur.com/rJnhTUG.png",
  "Kansas Jayhawks": "https://i.imgur.com/CDxaFKY.png",
  "Kansas State Wildcats": "https://i.imgur.com/9QJFeWa.png",
  "Kennesaw State Owls": "https://i.imgur.com/kXNSolO.png",
  "Kent State Golden Flashes": "https://i.imgur.com/GF7m8eE.png",
  "Kentucky Wildcats": "https://i.imgur.com/M7PmVR7.png",
  "Lafayette Ragin' Cajuns": "https://i.imgur.com/UDJsamv.png",
  "Liberty Flames": "https://i.imgur.com/HbtnueZ.png",
  "Louisiana Tech Bulldogs": "https://i.imgur.com/fTMLVzi.png",
  "Louisville Cardinals": "https://i.imgur.com/9sbwLXF.png",
  "LSU Tigers": "https://i.imgur.com/VS17Nsy.png",
  "Marshall Thundering Herd": "https://i.imgur.com/kznyRSc.png",
  "Maryland Terrapins": "https://i.imgur.com/AHZmTu4.png",
  "Massachusetts Minutemen": "https://i.imgur.com/DpEq0GQ.png",
  "Memphis Tigers": "https://i.imgur.com/KMyq79Q.png",
  "Miami Hurricanes": "https://i.imgur.com/SVtR4oY.png",
  "Miami Redhawks": "https://i.imgur.com/h3YybDS.png",
  "Michigan State Spartans": "https://i.imgur.com/m4QaHmu.png",
  "Michigan Wolverines": "https://i.imgur.com/F611D29.png",
  "Middle Tennessee State Blue Raiders": "https://i.imgur.com/zp6fnpe.png",
  "Minnesota Golden Gophers": "https://i.imgur.com/oiN1rtG.png",
  "Mississippi State Bulldogs": "https://i.imgur.com/MIk8N5r.png",
  "Missouri State Bears": "https://i.imgur.com/gybvEes.png",
  "Missouri Tigers": "https://i.imgur.com/SwMezGT.png",
  "Monroe Warhawks": "https://i.imgur.com/O0Knoh1.png",
  "Navy Midshipmen": "https://i.imgur.com/1OaGRGp.png",
  "Nebraska Cornhuskers": "https://i.imgur.com/2Oaz93O.png",
  "Nevada Wolf Pack": "https://i.imgur.com/fknfwmy.png",
  "New Mexico Lobos": "https://i.imgur.com/PgMCRT5.png",
  "New Mexico State Aggies": "https://i.imgur.com/sdRGddP.png",
  "North Carolina State Wolfpack": "https://i.imgur.com/acrRSno.png",
  "North Carolina Tar Heels": "https://i.imgur.com/uQwBbAg.png",
  "North Texas Mean Green": "https://i.imgur.com/FJu27tr.png",
  "Northern Illinois Huskies": "https://i.imgur.com/rB45HBn.png",
  "Northwestern Wildcats": "https://i.imgur.com/XJ90C3s.png",
  "Notre Dame Fighting Irish": "https://i.imgur.com/v5Jt5U0.png",
  "Ohio Bobcats": "https://i.imgur.com/c0cvsse.png",
  "Ohio State Buckeyes": "https://i.imgur.com/l4sb8kJ.png",
  "Oklahoma Sooners": "https://i.imgur.com/2xQtIAj.png",
  "Oklahoma State Cowboys": "https://i.imgur.com/wnZzORg.png",
  "Old Dominion Monarchs": "https://i.imgur.com/mybV1nZ.png",
  "Ole Miss Rebels": "https://i.imgur.com/nlFnhFv.png",
  "Oregon Ducks": "https://i.imgur.com/agCeDq7.png",
  "Oregon State Beavers": "https://i.imgur.com/Etg1WG6.png",
  "Penn State Nittany Lions": "https://i.imgur.com/9xn2tA1.png",
  "Pittsburgh Panthers": "https://i.imgur.com/iOm9P7S.png",
  "Purdue Boilermakers": "https://i.imgur.com/RVSg0ZT.png",
  "Rice Owls": "https://i.imgur.com/9E8LJDL.png",
  "Rutgers Scarlet Knights": "https://i.imgur.com/KqmENFW.png",
  "Sam Houston State Bearkats": "https://i.imgur.com/f4L04yr.png",
  "San Diego State Aztecs": "https://i.imgur.com/ntHVrPq.png",
  "San Jose State Spartans": "https://i.imgur.com/mEe0roq.png",
  "SMU Mustangs": "https://i.imgur.com/kW6uKaE.png",
  "South Alabama Jaguars": "https://i.imgur.com/VOI9pnS.png",
  "South Carolina Gamecocks": "https://i.imgur.com/lraZiou.png",
  "South Florida Bulls": "https://i.imgur.com/cv0dFiI.png",
  "Southern Mississippi Golden Eagles": "https://i.imgur.com/hMPAEnR.png",
  "Stanford Cardinal": "https://i.imgur.com/ZVUGplg.png",
  "Syracuse Orange": "https://i.imgur.com/RUwuZQ2.png",
  "TCU Horned Frogs": "https://i.imgur.com/3tf2B9g.png",
  "Temple Owls": "https://i.imgur.com/B1iv8DV.png",
  "Tennessee Volunteers": "https://i.imgur.com/bZWLkmZ.png",
  "Texas A&M Aggies": "https://i.imgur.com/e0PJnKV.png",
  "Texas Longhorns": "https://i.imgur.com/q4vT2Mk.png",
  "Texas State Bobcats": "https://i.imgur.com/lGsXqwz.png",
  "Texas Tech Red Raiders": "https://i.imgur.com/3hII0Qo.png",
  "Toledo Rockets": "https://i.imgur.com/PVqgA77.png",
  "Troy Trojans": "https://i.imgur.com/asolJAj.png",
  "Tulane Green Wave": "https://i.imgur.com/SYyJ9OY.png",
  "Tulsa Golden Hurricane": "https://i.imgur.com/0SmXB3e.png",
  "UAB Blazers": "https://i.imgur.com/F0k67aG.png",
  "UCF Knights": "https://i.imgur.com/LfBAhJl.png",
  "UCLA Bruins": "https://i.imgur.com/h3jGxhG.png",
  "UNLV Rebels": "https://i.imgur.com/trPAWON.png",
  "USC Trojans": "https://i.imgur.com/Fs85ZZ5.png",
  "Utah State Aggies": "https://i.imgur.com/bOJ7lDL.png",
  "Utah Utes": "https://i.imgur.com/tkZnRXA.png",
  "UTEP Miners": "https://i.imgur.com/BlsFSLQ.png",
  "UTSA Roadrunners": "https://i.imgur.com/OmMX64U.png",
  "Vanderbilt Commodores": "https://i.imgur.com/2iN56zn.png",
  "Virginia Cavaliers": "https://i.imgur.com/KJOkotE.png",
  "Virginia Tech Hokies": "https://i.imgur.com/FDlQUs2.png",
  "Wake Forest Demon Deacons": "https://i.imgur.com/rSbzrAk.png",
  "Washington Huskies": "https://i.imgur.com/HYesxla.png",
  "Washington State Cougars": "https://i.imgur.com/ugQGdDM.png",
  "West Virginia Mountaineers": "https://i.imgur.com/U1uvExa.png",
  "Western Kentucky Hilltoppers": "https://i.imgur.com/xgwRtOn.png",
  "Western Michigan Broncos": "https://i.imgur.com/9NB1uSz.png",
  "Wisconsin Badgers": "https://i.imgur.com/qEPZKqG.png",
  "Wyoming Cowboys": "https://i.imgur.com/Pjw5U7w.png"
}

// FBS teams array
export const teams = [
  "Air Force Falcons",
  "Akron Zips",
  "Alabama Crimson Tide",
  "Appalachian State Mountaineers",
  "Arizona State Sun Devils",
  "Arizona Wildcats",
  "Arkansas Razorbacks",
  "Arkansas State Red Wolves",
  "Army Black Knights",
  "Auburn Tigers",
  "Ball State Cardinals",
  "Baylor Bears",
  "Boise State Broncos",
  "Boston College Eagles",
  "Bowling Green Falcons",
  "Brigham Young Cougars",
  "Buffalo Bulls",
  "California Golden Bears",
  "Central Michigan Chippewas",
  "Charlotte 49ers",
  "Cincinnati Bearcats",
  "Clemson Tigers",
  "Coastal Carolina Chanticleers",
  "Colorado Buffaloes",
  "Colorado State Rams",
  "Connecticut Huskies",
  "Delaware Fightin' Blue Hens",
  "Duke Blue Devils",
  "East Carolina Pirates",
  "Eastern Michigan Eagles",
  "Florida Atlantic Owls",
  "Florida Gators",
  "Florida International Panthers",
  "Florida State Seminoles",
  "Fresno State Bulldogs",
  "Georgia Bulldogs",
  "Georgia Southern Eagles",
  "Georgia State Panthers",
  "Georgia Tech Yellow Jackets",
  "Hawaii Rainbow Warriors",
  "Houston Cougars",
  "Illinois Fighting Illini",
  "Indiana Hoosiers",
  "Iowa Hawkeyes",
  "Iowa State Cyclones",
  "Jacksonville State Gamecocks",
  "James Madison Dukes",
  "Kansas Jayhawks",
  "Kansas State Wildcats",
  "Kennesaw State Owls",
  "Kent State Golden Flashes",
  "Kentucky Wildcats",
  "Lafayette Ragin' Cajuns",
  "Liberty Flames",
  "Louisiana Tech Bulldogs",
  "Louisville Cardinals",
  "LSU Tigers",
  "Marshall Thundering Herd",
  "Maryland Terrapins",
  "Massachusetts Minutemen",
  "Memphis Tigers",
  "Miami Hurricanes",
  "Miami Redhawks",
  "Michigan State Spartans",
  "Michigan Wolverines",
  "Middle Tennessee State Blue Raiders",
  "Minnesota Golden Gophers",
  "Mississippi State Bulldogs",
  "Missouri State Bears",
  "Missouri Tigers",
  "Monroe Warhawks",
  "Navy Midshipmen",
  "Nebraska Cornhuskers",
  "Nevada Wolf Pack",
  "New Mexico Lobos",
  "New Mexico State Aggies",
  "North Carolina State Wolfpack",
  "North Carolina Tar Heels",
  "North Texas Mean Green",
  "Northern Illinois Huskies",
  "Northwestern Wildcats",
  "Notre Dame Fighting Irish",
  "Ohio Bobcats",
  "Ohio State Buckeyes",
  "Oklahoma Sooners",
  "Oklahoma State Cowboys",
  "Old Dominion Monarchs",
  "Ole Miss Rebels",
  "Oregon Ducks",
  "Oregon State Beavers",
  "Penn State Nittany Lions",
  "Pittsburgh Panthers",
  "Purdue Boilermakers",
  "Rice Owls",
  "Rutgers Scarlet Knights",
  "Sam Houston State Bearkats",
  "San Diego State Aztecs",
  "San Jose State Spartans",
  "SMU Mustangs",
  "South Alabama Jaguars",
  "South Carolina Gamecocks",
  "South Florida Bulls",
  "Southern Mississippi Golden Eagles",
  "Stanford Cardinal",
  "Syracuse Orange",
  "TCU Horned Frogs",
  "Temple Owls",
  "Tennessee Volunteers",
  "Texas A&M Aggies",
  "Texas Longhorns",
  "Texas State Bobcats",
  "Texas Tech Red Raiders",
  "Toledo Rockets",
  "Troy Trojans",
  "Tulane Green Wave",
  "Tulsa Golden Hurricane",
  "UAB Blazers",
  "UCF Knights",
  "UCLA Bruins",
  "UNLV Rebels",
  "USC Trojans",
  "Utah State Aggies",
  "Utah Utes",
  "UTEP Miners",
  "UTSA Roadrunners",
  "Vanderbilt Commodores",
  "Virginia Cavaliers",
  "Virginia Tech Hokies",
  "Wake Forest Demon Deacons",
  "Washington Huskies",
  "Washington State Cougars",
  "West Virginia Mountaineers",
  "Western Kentucky Hilltoppers",
  "Western Michigan Broncos",
  "Wisconsin Badgers",
  "Wyoming Cowboys"
]

// Helper to detect if teams object is tid-based (keys are numbers)
function isTidBasedTeamsLocal(teams) {
  if (!teams) return false
  return Object.keys(teams).some(k => !isNaN(parseInt(k)))
}

// Helper function to get mascot/full team name from abbreviation or tid (checks teambuilder teams first)
export function getMascotName(abbrOrTid, teamsOrCustomTeams = null) {
  if (abbrOrTid == null) return null

  // Handle tid (number) - look up directly in teams
  if (typeof abbrOrTid === 'number' && teamsOrCustomTeams) {
    const team = teamsOrCustomTeams[abbrOrTid]
    if (team) return team.name || null
    // Fall through to check if it might be a string-formatted tid
  }

  // Handle string-formatted tid (e.g., "45")
  if (typeof abbrOrTid === 'string' && /^\d+$/.test(abbrOrTid) && teamsOrCustomTeams) {
    const tid = parseInt(abbrOrTid, 10)
    const team = teamsOrCustomTeams[tid]
    if (team) return team.name || null
  }

  // Convert to string for abbreviation lookup
  const abbr = String(abbrOrTid)
  const upperAbbr = abbr.toUpperCase()

  // Check if we have tid-based dynasty.teams structure
  if (isTidBasedTeamsLocal(teamsOrCustomTeams)) {
    const teams = teamsOrCustomTeams
    // Find team by abbreviation in tid-based structure
    for (const [, team] of Object.entries(teams)) {
      if (team.abbr?.toUpperCase() === upperAbbr) {
        return team.name || null
      }
    }
    // Fall through to static lookup
  }

  // Legacy customTeams structure (abbr-keyed)
  const customTeams = teamsOrCustomTeams

  // Check if this IS a teambuilder team abbreviation
  if (customTeams?.[upperAbbr]) {
    return customTeams[upperAbbr].name
  }

  // Check if this abbreviation was replaced by a teambuilder team
  if (customTeams) {
    const teambuilderTeam = Object.values(customTeams).find(t => t.replacesTeam === upperAbbr)
    if (teambuilderTeam) {
      return teambuilderTeam.name
    }
  }

  const teamData = teamAbbreviations[upperAbbr]
  return teamData?.name || null
}

// Helper function to get just the school name (without mascot) from abbreviation or tid
// e.g., "Memphis Tigers" -> "Memphis", "Kentucky Wildcats" -> "Kentucky"
export function getSchoolName(abbrOrTid, teamsOrCustomTeams = null) {
  const fullName = getMascotName(abbrOrTid, teamsOrCustomTeams)
  if (!fullName) return null

  // Split by space and remove the last word (mascot)
  // Handle multi-word mascots like "Sun Devils", "Golden Bears", "Black Knights"
  const parts = fullName.split(' ')
  if (parts.length <= 1) return fullName

  // Common two-word mascots that we need to handle. Keep in sync with the
  // fallback list in src/pages/dynasty/Player.jsx — missing an entry here
  // produces buggy renders like "Tulsa Golden" instead of "Tulsa".
  const twoWordMascots = [
    'Sun Devils', 'Golden Bears', 'Golden Gophers', 'Golden Eagles', 'Golden Flashes',
    'Golden Hurricane', 'Golden Knights',
    'Black Knights', 'Yellow Jackets', 'Blue Devils', 'Blue Raiders', 'Blue Hens',
    'Red Raiders', 'Red Wolves', 'Mean Green', 'Green Wave', 'Horned Frogs',
    'Nittany Lions', 'Scarlet Knights', 'Orange Men', 'Fighting Irish',
    'Demon Deacons', 'Crimson Tide', 'War Eagles', 'Runnin Utes', 'Fightin Blue Hens',
    'Thundering Herd', 'Tar Heels', "Ragin' Cajuns", 'Wolf Pack', 'Fighting Illini',
    'Rainbow Warriors',
  ]

  // Check if the last two words form a known two-word mascot
  if (parts.length >= 3) {
    const lastTwo = `${parts[parts.length - 2]} ${parts[parts.length - 1]}`
    if (twoWordMascots.some(m => m.toLowerCase() === lastTwo.toLowerCase())) {
      return parts.slice(0, -2).join(' ')
    }
  }

  // Default: remove just the last word
  return parts.slice(0, -1).join(' ')
}

// Helper function to get team logo URL (checks teambuilder teams first)
// Helper to detect if teams object is tid-based (keys are numbers)
function isTidBasedTeams(teams) {
  if (!teams) return false
  return Object.keys(teams).some(k => !isNaN(parseInt(k)))
}

export function getTeamLogo(teamName, teamsOrCustomTeams = null) {
  if (!teamName) return null

  // Check if we have tid-based dynasty.teams structure
  if (isTidBasedTeams(teamsOrCustomTeams)) {
    const teams = teamsOrCustomTeams
    // Find team by name or abbreviation in tid-based structure
    for (const [, team] of Object.entries(teams)) {
      if (team.name === teamName || team.abbr === teamName) {
        // Return custom logo if available, otherwise fall through to static lookup
        if (team.logo) return team.logo
        break
      }
    }
    // Fall through to static logo lookup
  }

  // Legacy path: customTeams object keyed by abbreviation
  const customTeams = teamsOrCustomTeams
  if (customTeams && !isTidBasedTeams(customTeams)) {
    // Check by name
    const teambuilderByName = Object.values(customTeams).find(t => t.name === teamName)
    if (teambuilderByName?.logoUrl) {
      return teambuilderByName.logoUrl
    }

    // Check by abbreviation (if teamName is actually an abbreviation)
    if (customTeams[teamName]?.logoUrl) {
      return customTeams[teamName].logoUrl
    }

    // Check if teamName is the replaced team's abbreviation
    const teambuilderReplacing = Object.values(customTeams).find(t => t.replacesTeam === teamName)
    if (teambuilderReplacing?.logoUrl) {
      return teambuilderReplacing.logoUrl
    }

    // Check if teamName is the replaced team's full name
    const abbr = getAbbrFromTeamName(teamName)
    if (abbr) {
      const teambuilderReplacingByAbbr = Object.values(customTeams).find(t => t.replacesTeam === abbr)
      if (teambuilderReplacingByAbbr?.logoUrl) {
        return teambuilderReplacingByAbbr.logoUrl
      }
    }
  }

  // Check if this is an FCS team with a custom logo
  // First try to get abbreviation from display name
  const abbr = getAbbrFromTeamName(teamName)
  if (abbr) {
    const teamData = teamAbbreviations[abbr]
    if (teamData?.isFCS && teamData?.logo) {
      return teamData.logo
    }
  }

  // Also check if teamName is actually an abbreviation (e.g., "FCSN")
  const directTeamData = teamAbbreviations[teamName]
  if (directTeamData?.isFCS && directTeamData?.logo) {
    return directTeamData.logo
  }

  // Check direct team name match in teamLogos
  if (teamLogos[teamName]) {
    return teamLogos[teamName]
  }

  // If abbreviation was found, get the full name and check teamLogos
  if (abbr) {
    const fullName = teamAbbreviations[abbr]?.name
    if (fullName && teamLogos[fullName]) {
      return teamLogos[fullName]
    }
  }

  return null
}

// Helper function to get team logo by abbreviation (more direct for teambuilder teams)
export function getTeamLogoByAbbr(abbr, teamsOrCustomTeams = null) {
  if (!abbr) return null

  // Check if we have tid-based dynasty.teams structure
  if (isTidBasedTeams(teamsOrCustomTeams)) {
    const teams = teamsOrCustomTeams
    // Find team by abbreviation in tid-based structure
    for (const [, team] of Object.entries(teams)) {
      if (team.abbr === abbr) {
        if (team.logo) return team.logo
        break
      }
    }
    // Fall through to static logo lookup
  }

  // Legacy path: customTeams object keyed by abbreviation
  const customTeams = teamsOrCustomTeams
  if (customTeams && !isTidBasedTeams(customTeams)) {
    // Check if this IS a teambuilder team abbreviation
    if (customTeams[abbr]?.logoUrl) {
      return customTeams[abbr].logoUrl
    }

    // Check if this abbreviation was replaced by a teambuilder team
    const teambuilderTeam = Object.values(customTeams).find(t => t.replacesTeam === abbr)
    if (teambuilderTeam?.logoUrl) {
      return teambuilderTeam.logoUrl
    }
  }

  // Fall back to standard logo lookup
  const teamData = teamAbbreviations[abbr]
  if (teamData?.isFCS && teamData?.logo) {
    return teamData.logo
  }
  if (teamData?.name && teamLogos[teamData.name]) {
    return teamLogos[teamData.name]
  }

  return null
}

/**
 * Get team logo by tid (Team ID) - the preferred tid-based approach.
 * This should be used instead of getTeamLogo when you have a tid.
 *
 * @param {number} tid - Team ID
 * @param {Object} teams - dynasty.teams object (tid-keyed)
 * @returns {string|null} Logo URL or null
 */
export function getTeamLogoByTid(tid, teams) {
  if (!tid) return null

  const team = teams?.[tid] || TEAMS_REGISTRY[tid]
  if (!team) return null

  // Return custom logo if available
  if (team.logo) return team.logo

  // Fall back to static logo lookup by team name
  if (team.name && teamLogos[team.name]) {
    return teamLogos[team.name]
  }

  // Fall back by abbreviation
  const teamData = teamAbbreviations[team.abbr]
  if (teamData?.isFCS && teamData?.logo) {
    return teamData.logo
  }
  if (teamData?.name && teamLogos[teamData.name]) {
    return teamLogos[teamData.name]
  }

  return null
}

// Helper function to get team ID
export function getTeamId(teamName) {
  return espnTeamIds[teamName]
}
