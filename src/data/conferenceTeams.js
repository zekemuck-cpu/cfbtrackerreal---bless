// Team to Conference mapping for FBS
// Conference assignments as of 2024-2025 season

export const conferenceTeams = {
  "ACC": [
    "BC", "CAL", "CLEM", "DUKE", "FSU", "GT", "LOU", "MIA", "NCST", "UNC", "PITT", "SMU", "SYR", "STAN", "UVA", "VT", "WAKE"
  ],
  "Big Ten": [
    "ILL", "IU", "IOWA", "UMD", "MICH", "MSU", "MINN", "NEB", "NU", "OSU", "ORE", "PSU", "PUR", "RUTG", "UCLA", "USC", "WASH", "WIS"
  ],
  "Big 12": [
    "ARIZ", "ASU", "BU", "BYU", "UC", "COLO", "UH", "ISU", "KU", "KSU", "OKST", "TCU", "TTU", "UCF", "UTAH", "WVU"
  ],
  "SEC": [
    "BAMA", "ARK", "AUB", "FLA", "UGA", "UK", "LSU", "MISS", "MSST", "MIZ", "OU", "SCAR", "UT", "TEX", "TAMU", "VAN"
  ],
  "Pac-12": [
    "ORST", "WSU"
  ],
  "American": [
    "ARMY", "CHAR", "ECU", "FAU", "MEM", "NAVY", "UNT", "RICE", "TEM", "TULN", "TLSA", "UAB", "USF", "UTSA"
  ],
  "Mountain West": [
    "AFA", "BOIS", "CSU", "FRES", "HAW", "NEV", "SDSU", "SJSU", "UNM", "UNLV", "USU", "WYO"
  ],
  "Sun Belt": [
    "APP", "ARST", "CCU", "GASO", "GSU", "JMU", "JKST", "ULM", "UL", "MRSH", "ODU", "USA", "USM", "TXST", "TROY"
  ],
  "MAC": [
    "AKR", "BALL", "BGSU", "BUFF", "CMU", "EMU", "KENT", "M-OH", "NIU", "OHIO", "TOL", "WMU"
  ],
  "Conference USA": [
    "DEL", "FIU", "KENN", "LIB", "LT", "MTSU", "MZST", "NMSU", "SHSU", "UTEP", "WKU"
  ],
  "Independent": [
    "ND", "CONN", "MASS"
  ]
}

// Get conference for a team abbreviation OR tid.
// If customConferences is provided, it will be checked first before falling back to defaults
// customTeams object is used to resolve replaced team lookups (teambuilder teams)
//
// `abbrOrTid` may be: an abbr string (legacy), a numeric tid (preferred), or
// a numeric-string tid. Tid input is normalized through customTeams to the
// team's CURRENT abbr — important for teambuilder teams whose abbr drifted
// since the lookup site cached it.
export function getTeamConference(abbrOrTid, customConferences = null, customTeams = null) {
  // Normalize input: tid → current abbr
  let abbr = abbrOrTid
  if (customTeams && (typeof abbrOrTid === 'number' || (typeof abbrOrTid === 'string' && /^\d+$/.test(abbrOrTid)))) {
    const tidKey = String(abbrOrTid)
    const teamRec = customTeams[tidKey] || customTeams[Number(tidKey)]
    if (teamRec) abbr = teamRec.abbr || teamRec.abbreviation || abbr
  }

  // Check if this is a teambuilder team - if so, look up the conference of the team it replaced
  let lookupAbbr = abbr
  if (customTeams) {
    // Check if abbr is a teambuilder team's abbreviation
    const teambuilderTeam = Object.values(customTeams).find(t => t.abbreviation === abbr || t.abbr === abbr)
    if (teambuilderTeam && teambuilderTeam.replacesTeam) {
      // Use the replaced team's abbreviation to find the conference
      lookupAbbr = teambuilderTeam.replacesTeam
    }
  }

  // Check custom conferences first if provided
  if (customConferences) {
    for (const [conference, teams] of Object.entries(customConferences)) {
      // Check for both the original abbr and the lookup abbr (in case custom conferences already has the teambuilder team)
      if (teams && (teams.includes(abbr) || teams.includes(lookupAbbr))) {
        return conference
      }
    }
  }
  // Fall back to default conferences using the lookup abbreviation
  for (const [conference, teams] of Object.entries(conferenceTeams)) {
    if (teams.includes(lookupAbbr)) {
      return conference
    }
  }
  return null
}

/**
 * Get initial conference data with teambuilder team replacement applied
 * Used when creating a dynasty with a teambuilder team
 *
 * @param {Object} customTeams - Teambuilder teams object from dynasty
 * @returns {Object} Conference data with teambuilder team abbreviations replacing original teams
 */
export function getConferencesWithCustomTeams(customTeams) {
  if (!customTeams || Object.keys(customTeams).length === 0) {
    return null // No teambuilder teams, use defaults
  }

  // Deep copy the default conferences
  const conferences = {}
  for (const [conf, teams] of Object.entries(conferenceTeams)) {
    conferences[conf] = [...teams]
  }

  // Replace each replaced team with the teambuilder team abbreviation
  for (const teambuilderTeam of Object.values(customTeams)) {
    const replacedAbbr = teambuilderTeam.replacesTeam
    const teambuilderAbbr = teambuilderTeam.abbreviation

    // Find which conference has the replaced team and swap it
    for (const [conf, teams] of Object.entries(conferences)) {
      const idx = teams.indexOf(replacedAbbr)
      if (idx !== -1) {
        teams[idx] = teambuilderAbbr
        break
      }
    }
  }

  return conferences
}

// Get all teams in a conference
export function getConferenceTeamsList(conference) {
  return conferenceTeams[conference] || []
}

// Get all conferences
export function getAllConferences() {
  return Object.keys(conferenceTeams)
}
