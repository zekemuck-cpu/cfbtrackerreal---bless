import { createContext, useContext, useState, useEffect } from 'react'
import { getPublicDynastyWithSubcollections } from '../services/dynastyService'
import { getCurrentTeamAbbr, getCurrentTeamTid, getTidFromAbbr } from '../data/teamRegistry'
import { lookupByTeamYear } from './DynastyContext'
import DynastyContext from './DynastyContext'

const ViewDynastyContext = createContext()

/**
 * Universal hook that works in both regular and view-only modes
 * Use this in components that need to work in both contexts
 */
export function useDynastyCompat() {
  const viewContext = useContext(ViewDynastyContext)
  const dynastyContext = useContext(DynastyContext)

  // If we're in view mode, use the view context
  if (viewContext) {
    return viewContext
  }

  // Otherwise, use the regular dynasty context
  if (dynastyContext) {
    return {
      ...dynastyContext,
      // Use the context's isViewOnly flag (cloud dynasties are read-only for non-premium users)
      isViewOnly: dynastyContext.isViewOnly || false
    }
  }

  // Not in any context
  return null
}

/**
 * ViewDynastyProvider - Provides read-only dynasty data for public viewing
 * This is a simplified version of DynastyProvider that doesn't require authentication
 */
export function ViewDynastyProvider({ shareCode, children }) {
  const [dynasty, setDynasty] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const loadDynasty = async () => {
      if (!shareCode) {
        setError('No share code provided')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)
        // Use the new function that also fetches from subcollections
        const dynastyData = await getPublicDynastyWithSubcollections(shareCode)

        if (!dynastyData) {
          setError('Dynasty not found or sharing is disabled')
        } else {
          setDynasty(dynastyData)
        }
      } catch (err) {
        console.error('Error loading public dynasty:', err)
        setError('Failed to load dynasty')
      } finally {
        setLoading(false)
      }
    }

    loadDynasty()
  }, [shareCode])

  // No-op function that logs a warning - used for all mutation operations
  const viewOnlyNoOp = (fnName) => async () => {
    console.warn(`Cannot ${fnName} in view-only mode`)
    return null
  }

  // Read-only context value
  const value = {
    // Dynasty data (read-only)
    currentDynasty: dynasty,
    dynasties: dynasty ? [dynasty] : [],
    loading,
    error,

    // View-only flag - components MUST check this to hide edit buttons
    isViewOnly: true,

    // ============================================
    // NO-OP FUNCTIONS FOR ALL MUTATIONS
    // These do nothing in view mode to prevent any data modification
    // ============================================

    // Core CRUD operations
    createDynasty: viewOnlyNoOp('create dynasty'),
    updateDynasty: viewOnlyNoOp('update dynasty'),
    deleteDynasty: viewOnlyNoOp('delete dynasty'),
    importDynasty: viewOnlyNoOp('import dynasty'),

    // Game operations
    addGame: viewOnlyNoOp('add game'),
    saveCPUBowlGames: viewOnlyNoOp('save CPU bowl games'),
    saveCPUConferenceChampionships: viewOnlyNoOp('save CPU conference championships'),

    // Week/Season progression
    advanceWeek: viewOnlyNoOp('advance week'),
    advanceToNewSeason: viewOnlyNoOp('advance to new season'),
    revertWeek: viewOnlyNoOp('revert week'),

    // Schedule/Roster operations
    saveSchedule: viewOnlyNoOp('save schedule'),
    saveRoster: viewOnlyNoOp('save roster'),

    // Team data operations
    saveTeamRatings: viewOnlyNoOp('save team ratings'),
    saveTeamYearInfo: viewOnlyNoOp('save team year info'),
    saveCoachingStaff: viewOnlyNoOp('save coaching staff'),

    // Player operations
    updatePlayer: viewOnlyNoOp('update player'),
    deletePlayer: viewOnlyNoOp('delete player'),

    // Google Sheets operations
    createGoogleSheetForDynasty: viewOnlyNoOp('create Google sheet'),
    createTempSheetWithData: viewOnlyNoOp('create temp sheet'),
    deleteSheetAndClearRefs: viewOnlyNoOp('delete sheet'),
    createConferencesSheetForDynasty: viewOnlyNoOp('create conferences sheet'),
    saveConferences: viewOnlyNoOp('save conferences'),

    // Honor/Awards operations
    processHonorPlayers: viewOnlyNoOp('process honor players'),

    // Helper functions that work in view mode (read-only)
    getCurrentSchedule: () => {
      if (!dynasty) return []
      const tid = getCurrentTeamTid(dynasty)
      const year = dynasty.currentYear
      // Tid-based byYear is the primary source; legacy abbr-keyed
      // schedulesByTeamYear is checked drift-aware via lookupByTeamYear so
      // a teambuilder team renamed since the schedule was saved still
      // surfaces its data.
      if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.schedule) {
        return dynasty.teams[tid].byYear[year].schedule
      }
      const fromByTeamYear = lookupByTeamYear(dynasty.schedulesByTeamYear, dynasty, tid, year)
      if (fromByTeamYear) return fromByTeamYear
      return dynasty.schedule || []
    },

    getCurrentRoster: () => {
      if (!dynasty) return []
      const teamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName
      const teamTid = getTidFromAbbr(teamAbbr, dynasty)
      const currentYear = dynasty.currentYear
      // Use unified isPlayerOnRoster check - teamsByYear is the ONLY source of truth
      // Handle both tid (number) and legacy abbr (string) in teamsByYear
      return (dynasty.players || []).filter(p => {
        if (p.isHonorOnly) return false
        const playerTeam = p.teamsByYear?.[currentYear] ?? p.teamsByYear?.[String(currentYear)]
        if (playerTeam === undefined || playerTeam === null) return false
        // Handle both tid (number) and legacy abbr (string)
        if (typeof playerTeam === 'number') {
          return playerTeam === teamTid
        }
        // Legacy: string comparison
        return playerTeam === teamAbbr || playerTeam.toUpperCase() === teamAbbr?.toUpperCase()
      })
    }
  }

  return (
    <ViewDynastyContext.Provider value={value}>
      {/* Also provide DynastyContext so useDynasty() works in view mode */}
      <DynastyContext.Provider value={value}>
        {children}
      </DynastyContext.Provider>
    </ViewDynastyContext.Provider>
  )
}

export function useViewDynasty() {
  const context = useContext(ViewDynastyContext)
  if (!context) {
    throw new Error('useViewDynasty must be used within a ViewDynastyProvider')
  }
  return context
}

export default ViewDynastyContext
