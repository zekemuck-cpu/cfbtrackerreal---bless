/**
 * Player Matching Utility
 *
 * Handles matching new honor entries (awards, all-americans, all-conference)
 * to existing players in the players[] array.
 *
 * Rules:
 * - Same name + Same team + ≤5 seasons apart = Auto-link (same player)
 * - Same name + Different team + ≤5 seasons apart = Needs confirmation (probable transfer)
 * - Same name + ≥6 seasons apart = New player (impossible to be same due to eligibility rules)
 */

import { getAbbreviationFromDisplayName, teamAbbreviations } from '../data/teamAbbreviations'

// Normalize player name for comparison - handles whitespace, case, and special characters
export const normalizePlayerName = (name) => {
  if (!name) return ''
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')        // Collapse multiple spaces to single space
    .replace(/['']/g, "'")       // Normalize curly apostrophes to straight
    .replace(/[""]/g, '"')       // Normalize curly quotes to straight
}

// Normalize team to uppercase abbreviation for comparison
// Handles both full names ("Kentucky Wildcats") and abbreviations ("UK")
const normalizeTeamForComparison = (team) => {
  if (!team) return ''
  const upperTeam = team.toUpperCase()

  // First check if it's already an abbreviation
  if (teamAbbreviations[upperTeam]) {
    return upperTeam
  }

  // Try to get abbreviation from display name
  const abbr = getAbbreviationFromDisplayName(team)
  if (abbr) {
    return abbr.toUpperCase()
  }

  // Fallback: return as-is
  return upperTeam
}

// Get all years a player has records for (from all honor types and roster)
const getPlayerYears = (player) => {
  const years = new Set()

  // From teamsByYear (primary roster tracking) - most important!
  if (player.teamsByYear) {
    Object.keys(player.teamsByYear).forEach(y => years.add(Number(y)))
  }

  // From awards
  if (player.awards) {
    player.awards.forEach(a => years.add(a.year))
  }

  // From all-americans
  if (player.allAmericans) {
    player.allAmericans.forEach(a => years.add(a.year))
  }

  // From all-conference
  if (player.allConference) {
    player.allConference.forEach(a => years.add(a.year))
  }

  // From roster year (legacy field)
  if (player.rosterYear) {
    years.add(player.rosterYear)
  }

  return Array.from(years).sort((a, b) => a - b)
}

// Get all teams a player has been associated with (normalized to abbreviations)
const getPlayerTeams = (player) => {
  const teams = new Set()

  // From teamsByYear (primary roster tracking) - most important!
  if (player.teamsByYear) {
    Object.values(player.teamsByYear).forEach(t => {
      if (t) teams.add(normalizeTeamForComparison(t))
    })
  }

  // Primary team from roster (could be full name like "Kentucky Wildcats")
  if (player.team) {
    teams.add(normalizeTeamForComparison(player.team))
  }

  // Teams from honors (usually abbreviations like "UK")
  if (player.awards) {
    player.awards.forEach(a => {
      if (a.team) teams.add(normalizeTeamForComparison(a.team))
    })
  }

  if (player.allAmericans) {
    player.allAmericans.forEach(a => {
      if (a.school) teams.add(normalizeTeamForComparison(a.school))
    })
  }

  if (player.allConference) {
    player.allConference.forEach(a => {
      if (a.school) teams.add(normalizeTeamForComparison(a.school))
    })
  }

  // From teams array if it exists
  if (player.teams) {
    player.teams.forEach(t => teams.add(normalizeTeamForComparison(t)))
  }

  return Array.from(teams)
}

// Check if a year is within 5 seasons of any year in the player's history
const isWithinEligibilityWindow = (newYear, existingYears) => {
  if (existingYears.length === 0) return false

  for (const year of existingYears) {
    const diff = Math.abs(newYear - year)
    if (diff <= 5) return true
  }

  return false
}

/**
 * Find a matching player for a new honor entry
 *
 * @param {string} name - Player name from honor entry
 * @param {string} team - Team abbreviation from honor entry
 * @param {number} year - Year of the honor
 * @param {Array} players - Existing players array
 * @returns {Object} { player, matchType: 'exact' | 'transfer' | 'new', existingTeams, existingYears }
 */
export const findMatchingPlayer = (name, team, year, players) => {
  if (!name || !players) {
    return { player: null, matchType: 'new', existingTeams: [], existingYears: [] }
  }

  const normalizedName = normalizePlayerName(name)
  const normalizedTeam = normalizeTeamForComparison(team)

  // Find all players with matching name
  const nameMatches = players.filter(p =>
    normalizePlayerName(p.name) === normalizedName
  )

  if (nameMatches.length === 0) {
    return { player: null, matchType: 'new', existingTeams: [], existingYears: [] }
  }

  // For each name match, check year and team
  for (const player of nameMatches) {
    const existingYears = getPlayerYears(player)
    const existingTeams = getPlayerTeams(player)

    // Check if within eligibility window (5 seasons)
    if (isWithinEligibilityWindow(year, existingYears)) {
      // Same team = exact match (auto-link)
      if (existingTeams.includes(normalizedTeam)) {
        return {
          player,
          matchType: 'exact',
          existingTeams,
          existingYears
        }
      }

      // Different team but within window = probable transfer (needs confirmation)
      return {
        player,
        matchType: 'transfer',
        existingTeams,
        existingYears
      }
    }
  }

  // Name matches but all are outside eligibility window = new player
  return { player: null, matchType: 'new', existingTeams: [], existingYears: [] }
}

/**
 * Process a batch of honor entries and determine matches
 *
 * @param {Array} entries - Array of honor entries with { name, team, year, ... }
 * @param {Array} players - Existing players array
 * @returns {Object} { autoLink: [], needsConfirmation: [], newPlayers: [] }
 */
export const processHonorEntries = (entries, players) => {
  const results = {
    autoLink: [],        // Exact matches - auto-link to existing player
    needsConfirmation: [], // Transfer candidates - need user confirmation
    newPlayers: []       // No match found - create new player
  }

  for (const entry of entries) {
    const { name, team, year } = entry
    const match = findMatchingPlayer(name, team, year, players)

    if (match.matchType === 'exact') {
      results.autoLink.push({ entry, player: match.player })
    } else if (match.matchType === 'transfer') {
      results.needsConfirmation.push({
        entry,
        player: match.player,
        existingTeams: match.existingTeams,
        existingYears: match.existingYears
      })
    } else {
      results.newPlayers.push({ entry })
    }
  }

  return results
}

/**
 * Get a descriptive string of a player's most recent honor
 * Used for the confirmation popup
 */
export const getPlayerLastHonorDescription = (player) => {
  const allHonors = []

  if (player.awards) {
    player.awards.forEach(a => {
      allHonors.push({
        year: a.year,
        description: `${a.award} winner`,
        team: a.team
      })
    })
  }

  if (player.allAmericans) {
    player.allAmericans.forEach(a => {
      const designation = a.designation === 'first' ? '1st Team' :
                          a.designation === 'second' ? '2nd Team' : 'Freshman'
      allHonors.push({
        year: a.year,
        description: `${designation} All-American (${a.position})`,
        team: a.school
      })
    })
  }

  if (player.allConference) {
    player.allConference.forEach(a => {
      const designation = a.designation === 'first' ? '1st Team' :
                          a.designation === 'second' ? '2nd Team' : 'Freshman'
      allHonors.push({
        year: a.year,
        description: `${designation} All-Conference (${a.position})`,
        team: a.school
      })
    })
  }

  // Sort by year descending and get most recent
  allHonors.sort((a, b) => b.year - a.year)

  if (allHonors.length > 0) {
    const recent = allHonors[0]
    return { ...recent }
  }

  // Fallback if only roster data
  if (player.team) {
    return {
      year: player.rosterYear || 'Unknown',
      description: `${player.position || 'Player'}`,
      team: player.team
    }
  }

  return null
}
