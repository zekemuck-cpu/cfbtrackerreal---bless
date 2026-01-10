import { useEffect, useMemo } from 'react'
import { getTeamColors } from '../data/teamColors'
import { getCurrentTeamTid, getColorsFromTid, TEAMS } from '../data/teamRegistry'

/**
 * Hook to get and apply team colors
 * Supports both old customTeams and new tid-based dynasty.teams
 *
 * @param {string} teamName - Team name or abbreviation
 * @param {Object} customTeamsOrDynastyTeams - Either customTeams object OR dynasty.teams object
 * @returns {Object} Team colors { primary, secondary, tertiary? }
 */
export function useTeamColors(teamName, customTeamsOrDynastyTeams = null) {
  const colors = useMemo(() => {
    // Check if we have the new tid-based dynasty.teams structure
    // It's keyed by tid (numbers) instead of abbreviation (strings)
    const isTidBased = customTeamsOrDynastyTeams &&
      Object.keys(customTeamsOrDynastyTeams).some(k => !isNaN(parseInt(k)))

    if (isTidBased && teamName) {
      const teams = customTeamsOrDynastyTeams
      // Try to find team by name or abbreviation in the tid-based structure
      for (const [tid, team] of Object.entries(teams)) {
        if (team.name === teamName || team.abbr === teamName) {
          return {
            primary: team.primaryColor || '#374151',
            secondary: team.secondaryColor || '#FFFFFF',
            isTeambuilder: team.isTeambuilder || false
          }
        }
      }
      // Fall back to standard colors
      return getTeamColors(teamName, null)
    }

    // Legacy path: customTeams object keyed by abbreviation
    const customTeams = customTeamsOrDynastyTeams
    let result = null

    if (customTeams && teamName) {
      // Check by name
      const teambuilderByName = Object.values(customTeams).find(t => t.name === teamName)
      if (teambuilderByName) {
        result = {
          primary: teambuilderByName.backgroundColor || teambuilderByName.primaryColor,
          secondary: teambuilderByName.textColor || teambuilderByName.secondaryColor,
          isTeambuilder: true
        }
      }

      // Check by abbreviation
      if (!result && customTeams[teamName]) {
        const t = customTeams[teamName]
        result = {
          primary: t.backgroundColor || t.primaryColor,
          secondary: t.textColor || t.secondaryColor,
          isTeambuilder: true
        }
      }

      // Check if this is a replaced team
      if (!result) {
        const teambuilderReplacing = Object.values(customTeams).find(t => t.replacesTeam === teamName)
        if (teambuilderReplacing) {
          result = {
            primary: teambuilderReplacing.backgroundColor || teambuilderReplacing.primaryColor,
            secondary: teambuilderReplacing.textColor || teambuilderReplacing.secondaryColor,
            isTeambuilder: true
          }
        }
      }
    }

    // Fall back to standard colors
    if (!result) {
      result = getTeamColors(teamName, customTeams)
    }

    return result
  }, [teamName, customTeamsOrDynastyTeams])

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

/**
 * Hook to get team colors from a dynasty object using tid-based lookup
 * This is the preferred method for new code
 *
 * @param {Object} dynasty - The dynasty object (must have .teams and either .currentTid or .teamName)
 * @returns {Object} Team colors { primary, secondary }
 */
export function useCurrentTeamColors(dynasty) {
  const colors = useMemo(() => {
    if (!dynasty) {
      return { primary: '#374151', secondary: '#FFFFFF' }
    }

    const tid = dynasty.currentTid || getCurrentTeamTid(dynasty)
    if (tid && dynasty.teams) {
      return getColorsFromTid(dynasty.teams, tid)
    }

    // Fallback to old method
    return getTeamColors(dynasty.teamName, dynasty.customTeams)
  }, [dynasty])

  useEffect(() => {
    if (colors) {
      document.documentElement.style.setProperty('--team-primary', colors.primary)
      document.documentElement.style.setProperty('--team-secondary', colors.secondary)
    }
  }, [colors])

  return colors
}
