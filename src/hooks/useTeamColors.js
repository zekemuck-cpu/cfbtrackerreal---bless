import { useEffect } from 'react'
import { getTeamColors } from '../data/teamColors'

/**
 * Hook to get and apply team colors
 * Supports teambuilder teams
 *
 * @param {string} teamName - Team name or abbreviation
 * @param {Object} customTeams - Optional teambuilder teams object from dynasty
 * @returns {Object} Team colors { primary, secondary, tertiary? }
 */
export function useTeamColors(teamName, customTeams = null) {
  // Check teambuilder teams first
  let colors = null

  if (customTeams && teamName) {
    // Check by name
    const teambuilderByName = Object.values(customTeams).find(t => t.name === teamName)
    if (teambuilderByName) {
      colors = {
        primary: teambuilderByName.backgroundColor || teambuilderByName.primaryColor,
        secondary: teambuilderByName.textColor || teambuilderByName.secondaryColor,
        isTeambuilder: true
      }
    }

    // Check by abbreviation
    if (!colors && customTeams[teamName]) {
      const t = customTeams[teamName]
      colors = {
        primary: t.backgroundColor || t.primaryColor,
        secondary: t.textColor || t.secondaryColor,
        isTeambuilder: true
      }
    }

    // Check if this is a replaced team
    if (!colors) {
      const teambuilderReplacing = Object.values(customTeams).find(t => t.replacesTeam === teamName)
      if (teambuilderReplacing) {
        colors = {
          primary: teambuilderReplacing.backgroundColor || teambuilderReplacing.primaryColor,
          secondary: teambuilderReplacing.textColor || teambuilderReplacing.secondaryColor,
          isTeambuilder: true
        }
      }
    }
  }

  // Fall back to standard colors
  if (!colors) {
    colors = getTeamColors(teamName, customTeams)
  }

  useEffect(() => {
    if (teamName && colors) {
      // Set CSS custom properties for the team colors
      document.documentElement.style.setProperty('--team-primary', colors.primary)
      document.documentElement.style.setProperty('--team-secondary', colors.secondary)
      if (colors.tertiary) {
        document.documentElement.style.setProperty('--team-tertiary', colors.tertiary)
      }
    }
  }, [teamName, colors])

  return colors
}
