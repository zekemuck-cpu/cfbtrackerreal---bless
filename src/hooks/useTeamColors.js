import { useEffect, useMemo } from 'react'
import { getTeamColors } from '../data/teamColors'
import { getCurrentTeamTid, getColorsFromTid, TEAMS } from '../data/teamRegistry'

/**
 * Hook to get and apply team colors. Single tid-based code path —
 * looks up by name or abbr against `dynasty.teams[tid]` (the only
 * source of truth) and falls through to the static FBS color map
 * only when no slot matches.
 *
 * @param {string} teamName - Team name or abbreviation
 * @param {Object} dynastyTeams - The dynasty.teams object (tid-keyed)
 * @returns {Object} Team colors { primary, secondary, tertiary? }
 */
export function useTeamColors(teamName, dynastyTeams = null) {
  const colors = useMemo(() => {
    if (teamName && dynastyTeams) {
      for (const team of Object.values(dynastyTeams)) {
        if (team?.name === teamName || team?.abbr === teamName) {
          return {
            primary: team.primaryColor || '#374151',
            secondary: team.secondaryColor || '#FFFFFF'
          }
        }
      }
    }
    // Static FBS fallback for callers without dynasty context.
    return getTeamColors(teamName, null)
  }, [teamName, dynastyTeams])

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

    // Fallback to name-based lookup against dynasty.teams (or static).
    return getTeamColors(dynasty.teamName, dynasty.teams)
  }, [dynasty])

  useEffect(() => {
    if (colors) {
      document.documentElement.style.setProperty('--team-primary', colors.primary)
      document.documentElement.style.setProperty('--team-secondary', colors.secondary)
    }
  }, [colors])

  return colors
}

/**
 * Returns an inline style object containing scoped team-color CSS vars.
 * Apply to a wrapper element with `data-team-theme` attribute to scope
 * team colors to a subtree — safe to use even when multiple teams render
 * on the same page (e.g. cross-dynasty player view inside a dynasty page).
 *
 * Usage:
 *   const themeStyle = useTeamThemeStyle(teamColors)
 *   <div data-team-theme style={themeStyle}>...</div>
 *
 * @param {Object} colors - { primary, secondary, tertiary? }
 * @returns {Object} Inline style object with --team-primary etc.
 */
export function useTeamThemeStyle(colors) {
  return useMemo(() => {
    if (!colors) return {}
    const style = {}
    if (colors.primary) style['--team-primary'] = colors.primary
    if (colors.secondary) style['--team-secondary'] = colors.secondary
    if (colors.tertiary) style['--team-tertiary'] = colors.tertiary
    return style
  }, [colors])
}
