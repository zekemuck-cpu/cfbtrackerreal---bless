// Team-logo resolver with fallback through multiple lookup paths.
// Used by Game.jsx and GameEdit.jsx (and any other consumer that
// needs to render a team logo from a heterogeneous identifier — tid,
// abbr in any casing, or full mascot name). Single source of truth
// so both pages stay in lockstep instead of drifting through partial
// re-implementations.
//
// Lookup order:
//   1. tid-keyed lookup via dynasty.teams (if teamsData provided)
//   2. direct lookup (input is already a full mascot name)
//   3. abbreviation → mascot → logo
//   4. UPPERCASE abbreviation → mascot → logo (case-insensitive)
//   5. static teamAbbreviations map → name → logo

import { getTeamLogo, getMascotName } from '../data/teams'
import { teamAbbreviations } from '../data/teamAbbreviations'

export function getTeamLogoRobust(teamInput, teamsData = null) {
  if (!teamInput) return null

  // 1. Try tid-based lookup first if teams data provided.
  if (teamsData) {
    const logo = getTeamLogo(teamInput, teamsData)
    if (logo) return logo
  }

  // 2. Try direct lookup (if teamInput is already a full mascot name).
  let logo = getTeamLogo(teamInput, teamsData)
  if (logo) return logo

  // 3. Try as abbreviation via getMascotName.
  const mascotName = getMascotName(teamInput, teamsData)
  if (mascotName) {
    logo = getTeamLogo(mascotName, teamsData)
    if (logo) return logo
  }

  // 4. Try uppercase abbreviation (handle case sensitivity).
  const upperInput = typeof teamInput === 'string' ? teamInput.toUpperCase() : teamInput
  if (upperInput !== teamInput) {
    const mascotNameUpper = getMascotName(upperInput, teamsData)
    if (mascotNameUpper) {
      logo = getTeamLogo(mascotNameUpper, teamsData)
      if (logo) return logo
    }
  }

  // 5. Try looking up in teamAbbreviations map directly.
  const teamData = teamAbbreviations[teamInput] || teamAbbreviations[upperInput]
  if (teamData?.name) {
    logo = getTeamLogo(teamData.name, teamsData)
    if (logo) return logo
  }

  return null
}
