import { createContext, useContext, useState, useEffect } from 'react'
import { getPublicDynastyCached } from '../services/dynastyService'
import { getCurrentTeamAbbr, getCurrentTeamTid, getTidFromAbbr } from '../data/teamRegistry'
import { lookupByTeamYear } from './DynastyContext'
import DynastyContext from './DynastyContext'

const ViewDynastyContext = createContext()

/**
 * Universal hook that works in both regular and view-only modes.
 * Use this in components that need to work in both contexts.
 */
export function useDynastyCompat() {
  const viewContext = useContext(ViewDynastyContext)
  const dynastyContext = useContext(DynastyContext)

  if (viewContext) return viewContext
  if (dynastyContext) return { ...dynastyContext, isViewOnly: dynastyContext.isViewOnly || false }
  return null
}

/**
 * ViewDynastyProvider — read-only dynasty context for public shared links.
 * Loads the full dynasty (including subcollections + social data) without auth.
 * All mutation functions are no-ops so components never crash in view mode.
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
        // Edge-cached load: 1 Firestore read for the version key, everything
        // else via the CDN-cached /api/view-dynasty route. Falls back to
        // direct Firestore reads internally if the api is unavailable.
        const dynastyData = await getPublicDynastyCached(shareCode)
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

  // All write operations are silently blocked in view mode
  const viewOnlyNoOp = (fnName) => async () => {
    console.warn(`[ViewOnly] Cannot ${fnName} — read-only mode`)
    return null
  }

  const value = {
    // ── Dynasty data ──────────────────────────────────────────────────────────
    currentDynasty: dynasty,
    dynasties: dynasty ? [dynasty] : [],
    loading,
    error,
    cloudSyncing: false,
    loadingDynastyId: null,
    phaseOverride: null,
    setPhaseOverride: () => {},
    userTeams: dynasty ? [{ tid: dynasty.currentTid, abbr: dynasty.teams?.[dynasty.currentTid]?.abbr || dynasty.teamName }] : [],
    activeUserTid: dynasty?.currentTid ?? null,
    setActiveTeam: () => {},
    customTeams: dynasty?.customTeams || {},

    // ── View-only flag ────────────────────────────────────────────────────────
    isViewOnly: true,

    // ── Social — data is pre-loaded in getPublicDynastyWithSubcollections ─────
    // loadSocial is called by modals and feed components; return pre-loaded data.
    loadSocial: async () => ({
      socialCharacters: dynasty?.socialCharacters || {},
      socialFeedByYear: dynasty?.socialFeedByYear || {},
    }),

    // ── All mutation functions — no-ops ───────────────────────────────────────
    createDynasty: viewOnlyNoOp('create dynasty'),
    updateDynasty: viewOnlyNoOp('update dynasty'),
    deleteDynasty: viewOnlyNoOp('delete dynasty'),
    importDynasty: viewOnlyNoOp('import dynasty'),
    importDynastyFromUrl: viewOnlyNoOp('import dynasty from url'),
    exportDynasty: viewOnlyNoOp('export dynasty'),
    selectDynasty: viewOnlyNoOp('select dynasty'),

    // Game operations
    addGame: viewOnlyNoOp('add game'),
    updateGame: viewOnlyNoOp('update game'),
    deleteGame: viewOnlyNoOp('delete game'),
    patchGameFields: viewOnlyNoOp('patch game fields'),
    saveGameSetChanges: viewOnlyNoOp('save game set changes'),
    applyChangedPlayers: viewOnlyNoOp('apply changed players'),
    saveCPUBowlGames: viewOnlyNoOp('save CPU bowl games'),
    saveCPUConferenceChampionships: viewOnlyNoOp('save CPU conference championships'),
    saveWeeklyScores: viewOnlyNoOp('save weekly scores'),
    saveRankings: viewOnlyNoOp('save rankings'),
    saveCFPGames: viewOnlyNoOp('save CFP games'),
    saveConferenceChampionshipsHistoryFromSheet: viewOnlyNoOp('save CC history from sheet'),

    // Season progression
    advanceWeek: viewOnlyNoOp('advance week'),
    advanceToNewSeason: viewOnlyNoOp('advance to new season'),
    revertWeek: viewOnlyNoOp('revert week'),

    // Schedule / roster
    saveSchedule: viewOnlyNoOp('save schedule'),
    saveRoster: viewOnlyNoOp('save roster'),

    // Team data
    saveTeamRatings: viewOnlyNoOp('save team ratings'),
    saveTeamYearInfo: viewOnlyNoOp('save team year info'),
    saveCoachingStaff: viewOnlyNoOp('save coaching staff'),
    saveTeamFuture: viewOnlyNoOp('save team future'),
    updateTeambuilderTeam: viewOnlyNoOp('update teambuilder team'),
    addCustomTeam: viewOnlyNoOp('add custom team'),

    // Players
    updatePlayer: viewOnlyNoOp('update player'),
    deletePlayer: viewOnlyNoOp('delete player'),
    syncAllPlayersStats: viewOnlyNoOp('sync all players stats'),

    // Recaps
    saveWeekRecap: viewOnlyNoOp('save week recap'),
    deleteWeekRecap: viewOnlyNoOp('delete week recap'),

    // Social mutations
    importSocialUniverse: viewOnlyNoOp('import social universe'),
    saveSocialPosts: viewOnlyNoOp('save social posts'),
    replaceSocialWeek: viewOnlyNoOp('replace social week'),
    saveSocialCharacters: viewOnlyNoOp('save social characters'),
    updateSocialSettings: viewOnlyNoOp('update social settings'),
    updateSocialPlatform: viewOnlyNoOp('update social platform'),

    // Google Sheets
    createGoogleSheetForDynasty: viewOnlyNoOp('create Google sheet'),
    createTempSheetWithData: viewOnlyNoOp('create temp sheet'),
    deleteSheetAndClearRefs: viewOnlyNoOp('delete sheet'),
    createConferencesSheetForDynasty: viewOnlyNoOp('create conferences sheet'),

    // Conferences
    saveConferences: viewOnlyNoOp('save conferences'),
    saveConferenceAlignment: viewOnlyNoOp('save conference alignment'),
    migrateConferencesToPerTeam: viewOnlyNoOp('migrate conferences to per-team'),

    // Admin / maintenance
    processHonorPlayers: viewOnlyNoOp('process honor players'),
    analyzeDocumentSize: viewOnlyNoOp('analyze document size'),
    optimizeDocumentSize: viewOnlyNoOp('optimize document size'),
    migrateToSubcollections: viewOnlyNoOp('migrate to subcollections'),
    migrateDynastyStorage: viewOnlyNoOp('migrate dynasty storage'),

    // ── Read-only helper functions (same logic as DynastyContext) ─────────────
    getCurrentSchedule: () => {
      if (!dynasty) return []
      const tid = getCurrentTeamTid(dynasty)
      const year = dynasty.currentYear
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
      return (dynasty.players || []).filter(p => {
        if (p.isHonorOnly) return false
        const playerTeam = p.teamsByYear?.[currentYear] ?? p.teamsByYear?.[String(currentYear)]
        if (playerTeam === undefined || playerTeam === null) return false
        if (typeof playerTeam === 'number') return playerTeam === teamTid
        return playerTeam === teamAbbr || playerTeam.toUpperCase() === teamAbbr?.toUpperCase()
      })
    },
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
  if (!context) throw new Error('useViewDynasty must be used within a ViewDynastyProvider')
  return context
}

export default ViewDynastyContext
