// Team to Conference mapping for FBS
// Conference assignments as of 2024-2025 season

import { TEAMS } from './teamRegistry'

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
    "AFA", "BOIS", "CSU", "FRES", "HAW", "NEV", "SDSU", "SJSU", "UNM", "UNLV", "USU", "WYO", "NDSU"
  ],
  "Sun Belt": [
    "APP", "ARST", "CCU", "GASO", "GSU", "JMU", "JKST", "ULM", "UL", "MRSH", "ODU", "USA", "USM", "TXST", "TROY"
  ],
  "MAC": [
    "AKR", "BALL", "BGSU", "BUFF", "CMU", "EMU", "KENT", "M-OH", "NIU", "OHIO", "TOL", "WMU", "SAC"
  ],
  "Conference USA": [
    "DEL", "FIU", "KENN", "LIB", "LT", "MTSU", "MZST", "NMSU", "SHSU", "UTEP", "WKU"
  ],
  "Independent": [
    "ND", "CONN", "MASS"
  ]
}

// The save's own Conference table names conferences however the game
// stores them internally (e.g. 'MWC', 'CUSA') — that raw name flows
// straight into teams[tid].byYear[year].conference on every sync (see
// cfb27SaveSync.js's conference self-heal), with no normalization against
// this app's canonical display names. A page that then compares a team's
// resolved conference against a hardcoded canonical name ('Mountain West',
// 'Conference USA') never matches, even though the underlying alignment
// data is perfectly correct — confirmed against a real dynasty where CC
// History showed 0 games forever for exactly the two conferences whose
// in-save short name differs from the canonical one. Kept separate from
// getTeamConference itself (rather than canonicalizing its return value
// there) because several pages build their filter/dropdown option lists
// directly from getCustomConferencesForYear's own raw keys and then compare
// getTeamConference's result against THOSE raw values — canonicalizing
// inside getTeamConference would break that comparison. Callers that need
// canonical names (anything checked against a fixed list like this file's
// own `conferenceTeams` keys) should call canonicalizeConferenceName
// themselves.
export const CONFERENCE_ALIASES = {
  'Mountain West': ['Mountain West', 'MWC'],
  'ACC': ['ACC'],
  'American': ['American', 'AAC'],
  'Big 12': ['Big 12', 'Big XII'],
  'Big Ten': ['Big Ten', 'B1G'],
  'Conference USA': ['Conference USA', 'CUSA', 'C-USA'],
  'Independent': ['Independent', 'Ind', 'IND'],
  'MAC': ['MAC'],
  'Pac-12': ['Pac-12', 'Pac 12'],
  'SEC': ['SEC'],
  'Sun Belt': ['Sun Belt'],
}

const ALIAS_TO_CANONICAL = (() => {
  const map = {}
  for (const [canonical, aliases] of Object.entries(CONFERENCE_ALIASES)) {
    for (const alias of aliases) map[alias] = canonical
  }
  return map
})()

// Maps a known save-side alias to this app's canonical display name.
// Unrecognized names (a fully custom/teambuilder conference) pass through
// unchanged rather than being coerced to something wrong.
export function canonicalizeConferenceName(name) {
  if (!name) return name
  return ALIAS_TO_CANONICAL[name] || name
}

// Get conference for a team abbreviation OR tid.
//
// `abbrOrTid` may be an abbr string OR a numeric tid (preferred). Tid
// input is resolved against `dynasty.teams[tid]` (tid-keyed) — the
// slot's CURRENT abbr is used. For TB slots that's the TB's new abbr;
// for FBS slots it's the original.
//
// Lookup order:
//   1. customConferences (dynasty-specific, year-aware) — the TB's
//      abbr is already swapped in here at creation via
//      getConferencesWithCustomTeams, so a direct match works.
//   2. Static default conferences keyed by FBS abbrs.
//
// No `customTeams` parameter — that legacy map is gone. Pass
// `dynasty.teams` (tid-keyed) for tid resolution.
export function getTeamConference(abbrOrTid, customConferences = null, dynastyTeams = null) {
  // Normalize tid → this dynasty's CURRENT abbr (used for the customConferences
  // check below, which is keyed by current abbrs). Also resolve the tid itself
  // when we were only handed an abbr, by reverse-scanning dynastyTeams for the
  // slot that owns it — needed for the base-abbr lookup further down.
  let abbr = abbrOrTid
  let tid = null
  if (typeof abbrOrTid === 'number' || (typeof abbrOrTid === 'string' && /^\d+$/.test(abbrOrTid))) {
    tid = Number(abbrOrTid)
    if (dynastyTeams) {
      const slot = dynastyTeams[String(tid)] || dynastyTeams[tid]
      if (slot?.abbr) abbr = slot.abbr
    }
  } else if (dynastyTeams && typeof abbr === 'string') {
    for (const [t, team] of Object.entries(dynastyTeams)) {
      if (team?.abbr === abbr) { tid = Number(t); break }
    }
  }

  // Custom conferences win — they're built from teams[tid].byYear[year].conference
  // keyed by each team's CURRENT abbr, so matching the current abbr here is
  // always correct (a teambuilder/CFB27 rename included).
  if (customConferences) {
    for (const [conference, teams] of Object.entries(customConferences)) {
      if (teams?.includes(abbr)) return conference
    }
  }

  // Static default conferences are keyed by the BASE registry's original
  // abbreviations. A dynasty-specific rename (teambuilder, or a game
  // edition's own abbr set diverging from the base registry — e.g. CFB27's
  // MIZZ/OKLA/TENN/VAND vs the registry's MIZ/OU/UT/VAN) can leave the
  // current abbr not matching anything here, OR WORSE, coincidentally
  // collide with a DIFFERENT team's base abbr (CFB27 renames Louisville to
  // "UL", which is this table's entry for Louisiana-Lafayette) and silently
  // resolve to the wrong conference. So whenever a tid is known, always look
  // up by that team's OWN base abbr — never trust the current abbr against
  // this specific table. Only fall back to the raw current abbr when no tid
  // could be resolved at all.
  const staticAbbr = tid != null ? (TEAMS[tid]?.abbr || abbr) : abbr
  for (const [conference, teams] of Object.entries(conferenceTeams)) {
    if (teams.includes(staticAbbr)) return conference
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
