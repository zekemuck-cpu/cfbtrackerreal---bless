import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useDynasty, propagateCFPWinner, GAME_TYPES } from '../../context/DynastyContext'
import { useAuth } from '../../context/AuthContext'
import { useTeamColors } from '../../hooks/useTeamColors'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getContrastTextColor } from '../../utils/colorUtils'
import { getTeamName } from '../../data/teamAbbreviations'
import { TEAMS, getOriginalTeamAbbr, getTidFromAbbr } from '../../data/teamRegistry'
import { getTeamConference } from '../../data/conferenceTeams'
import { storageService, STORAGE_TIER, indexedDBStorage } from '../../services/storage'
import TeambuilderEditModal from '../../components/TeambuilderEditModal'
import { SEED_TO_SLOT, getCFPGameId, DEFAULT_BOWL_CONFIG, getBowlForSlot } from '../../data/cfpConstants'
import { findMatchingPlayer, normalizePlayerName } from '../../utils/playerMatching'

export default function DangerZone() {
  const { currentDynasty, cleanupRosterData, removeOrphanedRosterEntries, migratePlayerCareerData, fixTransferredPlayers, analyzeDocumentSize, optimizeDocumentSize, migrateToSubcollections, updateDynasty, updateTeambuilderTeam, exportDynasty, isViewOnly } = useDynasty()
  const { user } = useAuth()
  const { id: dynastyId } = useParams()
  const pathPrefix = usePathPrefix()
  const teamColors = useTeamColors(currentDynasty?.teamName, currentDynasty?.teams || currentDynasty?.customTeams)
  const primaryBgText = getContrastTextColor(teamColors.primary)
  const secondaryBgText = getContrastTextColor(teamColors.secondary)

  // Status states
  const [rosterCleanupStatus, setRosterCleanupStatus] = useState(null)
  const [orphanCleanupStatus, setOrphanCleanupStatus] = useState(null)
  const [migrationStatus, setMigrationStatus] = useState(null)
  const [transferFixStatus, setTransferFixStatus] = useState(null)
  const [clearCacheStatus, setClearCacheStatus] = useState(null)
  const [recruitingSyncStatus, setRecruitingSyncStatus] = useState(null)
  const [duplicateGameCleanupStatus, setDuplicateGameCleanupStatus] = useState(null)
  const [sizeAnalysis, setSizeAnalysis] = useState(null)
  const [optimizeStatus, setOptimizeStatus] = useState(null)
  const [removeOldBoxScores, setRemoveOldBoxScores] = useState(false)
  const [subcollectionMigrationStatus, setSubcollectionMigrationStatus] = useState(null)
  const [showTeambuilderEditModal, setShowTeambuilderEditModal] = useState(false)
  const [selectedTeambuilderTid, setSelectedTeambuilderTid] = useState(null)
  const [showHelp, setShowHelp] = useState(false)

  // Storage tier testing state
  const [currentStorageTier, setCurrentStorageTier] = useState(storageService.getTier())
  const [debugEnabled, setDebugEnabled] = useState(true)
  const [storageInfo, setStorageInfo] = useState(null)

  // CFP repair state
  const [cfpRepairStatus, setCfpRepairStatus] = useState(null)

  // CCG repair state
  const [ccgRepairStatus, setCcgRepairStatus] = useState(null)

  // Game deletion state
  const [showGameDeletion, setShowGameDeletion] = useState(false)
  const [selectedGameToDelete, setSelectedGameToDelete] = useState(null)
  const [gameDeletionStatus, setGameDeletionStatus] = useState(null)

  // Honors sync state
  const [honorsSyncStatus, setHonorsSyncStatus] = useState(null)

  if (!currentDynasty) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: teamColors.primary }}></div>
      </div>
    )
  }

  if (isViewOnly) {
    return (
      <div className="p-6">
        <div className="rounded-lg p-6 text-center" style={{ backgroundColor: teamColors.secondary }}>
          <h2 className="text-xl font-bold mb-2" style={{ color: secondaryBgText }}>Danger Zone</h2>
          <p style={{ color: secondaryBgText, opacity: 0.7 }}>Danger Zone is not available in view-only mode.</p>
        </div>
      </div>
    )
  }

  // Handlers
  const handleRosterCleanup = async () => {
    setRosterCleanupStatus('running')
    try {
      const result = await cleanupRosterData(currentDynasty.id)
      setRosterCleanupStatus(result)
    } catch (error) {
      setRosterCleanupStatus({ success: false, message: 'Cleanup failed: ' + error.message })
    }
  }

  const handleOrphanCleanup = async () => {
    setOrphanCleanupStatus('running')
    try {
      const result = await removeOrphanedRosterEntries(currentDynasty.id)
      setOrphanCleanupStatus(result)
    } catch (error) {
      setOrphanCleanupStatus({ success: false, message: 'Cleanup failed: ' + error.message })
    }
  }

  const handleMigration = async () => {
    setMigrationStatus('running')
    try {
      const result = await migratePlayerCareerData(currentDynasty.id)
      setMigrationStatus(result)
    } catch (error) {
      setMigrationStatus({ success: false, message: 'Migration failed: ' + error.message })
    }
  }

  const handleFixTransfers = async () => {
    setTransferFixStatus('running')
    try {
      const result = await fixTransferredPlayers(currentDynasty.id)
      setTransferFixStatus(result)
    } catch (error) {
      setTransferFixStatus({ success: false, message: 'Fix failed: ' + error.message })
    }
  }

  const handleClearCache = () => {
    setClearCacheStatus('running')
    try {
      const keysToRemove = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && (key.includes('dynasty') || key.includes('sheet') || key.includes('token'))) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key))
      setClearCacheStatus({ success: true, message: `Cleared ${keysToRemove.length} items` })
    } catch (error) {
      setClearCacheStatus({ success: false, message: 'Failed: ' + error.message })
    }
  }

  const handleSyncRecruitingData = async () => {
    setRecruitingSyncStatus('running')
    try {
      const players = currentDynasty.players || []
      const existingCommitments = currentDynasty.recruitingCommitmentsByTeamYear || {}
      let updatedCount = 0
      let addedCount = 0
      const updatedCommitments = { ...existingCommitments }

      players.forEach(player => {
        if (!player.recruitYear || !player.name) return
        const recruitYear = Number(player.recruitYear)
        const enrollmentYear = recruitYear + 1
        const recruitedTeam = player.teamsByYear?.[enrollmentYear] || player.team
        if (!recruitedTeam) return

        if (!updatedCommitments[recruitedTeam]) updatedCommitments[recruitedTeam] = {}
        if (!updatedCommitments[recruitedTeam][recruitYear]) updatedCommitments[recruitedTeam][recruitYear] = {}

        let foundExisting = false
        Object.entries(updatedCommitments[recruitedTeam][recruitYear]).forEach(([key, weekCommitments]) => {
          if (Array.isArray(weekCommitments)) {
            const idx = weekCommitments.findIndex(c => c.name?.toLowerCase().trim() === player.name.toLowerCase().trim())
            if (idx !== -1) {
              foundExisting = true
              const isPortalPlayer = player.isPortal || !!player.previousTeam
              weekCommitments[idx] = {
                ...weekCommitments[idx], name: player.name, position: player.position,
                class: isPortalPlayer ? player.year : (weekCommitments[idx].class || 'HS'),
                devTrait: player.devTrait, archetype: player.archetype, height: player.height,
                weight: player.weight, hometown: player.hometown, state: player.state,
                stars: player.stars, nationalRank: player.nationalRank, stateRank: player.stateRank,
                positionRank: player.positionRank, gemBust: player.gemBust, previousTeam: player.previousTeam,
                isPortal: player.isPortal || !!player.previousTeam, pid: player.pid
              }
              updatedCount++
            }
          }
        })

        const isPortalPlayer = player.isPortal || !!player.previousTeam
        if (!foundExisting && (player.stars || player.nationalRank || isPortalPlayer)) {
          if (!updatedCommitments[recruitedTeam][recruitYear]['synced']) {
            updatedCommitments[recruitedTeam][recruitYear]['synced'] = []
          }
          updatedCommitments[recruitedTeam][recruitYear]['synced'].push({
            name: player.name, position: player.position, class: isPortalPlayer ? player.year : 'HS',
            devTrait: player.devTrait, archetype: player.archetype, height: player.height,
            weight: player.weight, hometown: player.hometown, state: player.state, stars: player.stars,
            nationalRank: player.nationalRank, stateRank: player.stateRank, positionRank: player.positionRank,
            gemBust: player.gemBust, previousTeam: player.previousTeam,
            isPortal: player.isPortal || !!player.previousTeam, pid: player.pid
          })
          addedCount++
        }
      })

      await updateDynasty(currentDynasty.id, { recruitingCommitmentsByTeamYear: updatedCommitments })
      setRecruitingSyncStatus({ success: true, message: `Updated ${updatedCount}, added ${addedCount}` })
    } catch (error) {
      setRecruitingSyncStatus({ success: false, message: 'Sync failed: ' + error.message })
    }
  }

  const handleDuplicateGameCleanup = async () => {
    setDuplicateGameCleanupStatus('running')
    try {
      const games = currentDynasty.games || []
      const seenGames = new Map()
      const duplicateIds = []

      // Log all games for debugging
      console.log('[DuplicateCleanup] Total games:', games.length)
      console.log('[DuplicateCleanup] All games:', games.map(g => ({
        id: g.id,
        year: g.year,
        week: g.week,
        gameType: g.gameType || 'regular',
        team1Tid: g.team1Tid,
        team2Tid: g.team2Tid,
        userTid: g.userTid,
        opponentTid: g.opponentTid,
        userTeam: g.userTeam,
        opponent: g.opponent,
        team1: g.team1,
        team2: g.team2,
        team1Score: g.team1Score,
        team2Score: g.team2Score,
        isConferenceChampionship: g.isConferenceChampionship
      })))

      // Helper to normalize game type for key generation
      const normalizeGameType = (game) => {
        if (game.isConferenceChampionship || game.gameType === 'conference_championship') return 'ccg'
        if (game.isCFPFirstRound || game.gameType === 'cfp_first_round') return 'cfp_r1'
        if (game.isCFPQuarterfinal || game.gameType === 'cfp_quarterfinal') return 'cfp_qf'
        if (game.isCFPSemifinal || game.gameType === 'cfp_semifinal') return 'cfp_sf'
        if (game.isCFPChampionship || game.gameType === 'cfp_championship') return 'cfp_nc'
        if (game.isBowlGame || game.gameType === 'bowl') return 'bowl'
        return 'regular'
      }

      // Helper to get a game's "quality score" - higher is better, we keep the better one
      const getGameQuality = (game) => {
        let score = 0
        // Has actual scores (not 0-0 or null)
        if (game.team1Score > 0 || game.team2Score > 0) score += 100
        // Has any score set at all (even if 0)
        if (game.team1Score !== null && game.team1Score !== undefined) score += 10
        // Has box score data
        if (game.boxScore && Object.keys(game.boxScore).length > 0) score += 50
        // Has team tids (better than legacy abbr-only)
        if (game.team1Tid && game.team2Tid) score += 5
        return score
      }

      // Helper to check if game has real scores
      const hasScores = (game) => {
        return (game.team1Score > 0 || game.team2Score > 0) ||
               (game.team1Score === 0 && game.team2Score === 0 &&
                game.team1Score !== null && game.team1Score !== undefined)
      }

      // Helper to get teams in consistent order (lower tid first) for key generation
      // Handles both tid fields and legacy abbreviation fields
      const getTeamPair = (game) => {
        // Get team 1 tid - check tid fields first, then convert from abbreviation
        let t1 = game.team1Tid || game.userTid || 0
        if (!t1 && game.userTeam) {
          t1 = getTidFromAbbr(game.userTeam) || 0
        }
        if (!t1 && game.team1) {
          t1 = getTidFromAbbr(game.team1) || 0
        }

        // Get team 2 tid - check tid fields first, then convert from abbreviation
        let t2 = game.team2Tid || game.opponentTid || 0
        if (!t2 && game.opponent) {
          t2 = getTidFromAbbr(game.opponent) || 0
        }
        if (!t2 && game.team2) {
          t2 = getTidFromAbbr(game.team2) || 0
        }

        return t1 < t2 ? `${t1}-${t2}` : `${t2}-${t1}`
      }

      // PASS 1: Find exact duplicates (same week/type/teams)
      games.forEach(game => {
        const gameType = normalizeGameType(game)
        const teamPair = getTeamPair(game)

        // Build key based on game type
        let key
        if (gameType === 'bowl') {
          key = `${game.year ?? 0}-bowl-${(game.bowlName || '').toLowerCase()}-${teamPair}`
        } else if (gameType === 'ccg') {
          key = `${game.year ?? 0}-ccg-${teamPair}`
        } else if (gameType.startsWith('cfp_')) {
          key = game.cfpSlot
            ? `${game.year ?? 0}-${game.cfpSlot}`
            : `${game.year ?? 0}-${gameType}-${teamPair}`
        } else {
          key = `${game.year ?? 0}-week${game.week ?? 0}-${teamPair}`
        }

        if (seenGames.has(key)) {
          const existingId = seenGames.get(key)
          const existingGame = games.find(g => g.id === existingId)
          const existingQuality = existingGame ? getGameQuality(existingGame) : 0
          const currentQuality = getGameQuality(game)

          if (currentQuality > existingQuality) {
            duplicateIds.push(existingId)
            seenGames.set(key, game.id)
          } else {
            duplicateIds.push(game.id)
          }
        } else {
          seenGames.set(key, game.id)
        }
      })

      // PASS 2: Find orphan games - empty games where a scored game exists vs same opponent
      // This catches cases like: Week 13 vs Penn State (no scores) when CCG vs Penn State (34-27) exists
      const gamesByYearAndOpponent = new Map()
      console.log('[DuplicateCleanup] Pass 2 - Checking for orphan games...')
      games.forEach(game => {
        if (duplicateIds.includes(game.id)) return // Skip already marked duplicates
        const teamPair = getTeamPair(game)
        const key = `${game.year ?? 0}-${teamPair}`
        if (!gamesByYearAndOpponent.has(key)) {
          gamesByYearAndOpponent.set(key, [])
        }
        gamesByYearAndOpponent.get(key).push(game)
      })

      // Log groups with multiple games for debugging
      gamesByYearAndOpponent.forEach((gamesInGroup, key) => {
        if (gamesInGroup.length > 1) {
          console.log(`[DuplicateCleanup] Found ${gamesInGroup.length} games for key "${key}":`,
            gamesInGroup.map(g => ({
              id: g.id,
              week: g.week,
              gameType: g.gameType,
              team1Score: g.team1Score,
              team2Score: g.team2Score,
              hasScores: hasScores(g)
            }))
          )
        }
      })

      // For each year+opponent group, if there are multiple games and some have scores while others don't,
      // remove the ones without scores (they're orphan shells)
      gamesByYearAndOpponent.forEach((gamesInGroup) => {
        if (gamesInGroup.length <= 1) return

        const scoredGames = gamesInGroup.filter(g => hasScores(g))
        const unscoredGames = gamesInGroup.filter(g => !hasScores(g))

        // If we have at least one scored game, remove all unscored ones as orphans
        if (scoredGames.length > 0 && unscoredGames.length > 0) {
          console.log(`[DuplicateCleanup] Marking ${unscoredGames.length} orphan game(s) for removal`)
          unscoredGames.forEach(g => {
            if (!duplicateIds.includes(g.id)) {
              duplicateIds.push(g.id)
            }
          })
        }
      })

      if (duplicateIds.length === 0) {
        setDuplicateGameCleanupStatus({ success: true, message: 'No duplicates found!' })
        return
      }

      const cleanedGames = games.filter(g => !duplicateIds.includes(g.id))
      await updateDynasty(currentDynasty.id, { games: cleanedGames })
      setDuplicateGameCleanupStatus({ success: true, message: `Removed ${duplicateIds.length} duplicate(s)` })
    } catch (error) {
      setDuplicateGameCleanupStatus({ success: false, message: 'Cleanup failed: ' + error.message })
    }
  }

  // Delete a specific game by ID
  const handleDeleteGame = async (gameId) => {
    if (!gameId) return
    if (!window.confirm('Are you sure you want to delete this game? This cannot be undone.')) return

    setGameDeletionStatus('running')
    try {
      const games = currentDynasty.games || []
      const cleanedGames = games.filter(g => g.id !== gameId)
      await updateDynasty(currentDynasty.id, { games: cleanedGames })
      setGameDeletionStatus({ success: true, message: 'Game deleted successfully' })
      setSelectedGameToDelete(null)
    } catch (error) {
      setGameDeletionStatus({ success: false, message: 'Delete failed: ' + error.message })
    }
  }

  // Sync all honors (awards, All-Americans, All-Conference) to player records
  const handleSyncHonorsToPlayers = async () => {
    setHonorsSyncStatus('running')
    try {
      const awardsByYear = currentDynasty.awardsByYear || {}
      const allAmericansByYear = currentDynasty.allAmericansByYear || {}
      let existingPlayers = [...(currentDynasty.players || [])]
      let nextPID = currentDynasty.nextPID || (existingPlayers.length + 1)

      let linkedCount = 0
      let createdCount = 0
      let skippedCount = 0

      console.log('[HonorsSync] Starting honors sync...')
      console.log(`[HonorsSync] Existing players: ${existingPlayers.length}`)

      // Helper: Check if a player already has a specific honor
      const playerHasHonor = (player, honorType, honor, year) => {
        if (honorType === 'awards') {
          return player.accolades?.some(a =>
            a.year === year && a.award === honor.award
          )
        } else if (honorType === 'allAmericans') {
          return player.allAmericans?.some(a =>
            a.year === year && a.designation === honor.designation && a.position === honor.position
          )
        } else if (honorType === 'allConference') {
          return player.allConference?.some(a =>
            a.year === year && a.designation === honor.designation && a.position === honor.position
          )
        }
        return false
      }

      // Helper: Add honor to a player record
      const addHonorToPlayer = (player, honorType, honor, year, playerTeam) => {
        const updatedPlayer = { ...player }

        // Initialize arrays if needed
        if (!updatedPlayer.accolades) updatedPlayer.accolades = []
        if (!updatedPlayer.allAmericans) updatedPlayer.allAmericans = []
        if (!updatedPlayer.allConference) updatedPlayer.allConference = []
        if (!updatedPlayer.teams) updatedPlayer.teams = []
        if (!updatedPlayer.teamsByYear) updatedPlayer.teamsByYear = {}

        // Add team if not already tracked
        if (playerTeam && !updatedPlayer.teams.includes(playerTeam)) {
          updatedPlayer.teams.push(playerTeam)
        }

        // Get tid for the team
        const tid = playerTeam ? getTidFromAbbr(playerTeam) : null

        // Add to teamsByYear if we have a tid and this year isn't already tracked
        if (tid && !updatedPlayer.teamsByYear[year]) {
          updatedPlayer.teamsByYear[year] = tid
        }

        // Add the honor
        if (honorType === 'awards') {
          updatedPlayer.accolades.push({
            year,
            award: honor.award,
            team: playerTeam,
            position: honor.position,
            class: honor.class
          })
        } else if (honorType === 'allAmericans') {
          updatedPlayer.allAmericans.push({
            year,
            designation: honor.designation,
            position: honor.position,
            school: playerTeam,
            class: honor.class
          })
        } else if (honorType === 'allConference') {
          updatedPlayer.allConference.push({
            year,
            designation: honor.designation,
            position: honor.position,
            school: playerTeam,
            class: honor.class
          })
        }

        return updatedPlayer
      }

      // Helper: Create a new player for an honor
      const createPlayerForHonor = (name, position, team, honorType, honor, year) => {
        const tid = team ? getTidFromAbbr(team) : null
        const newPlayer = {
          pid: nextPID++,
          name: name,
          position: position || '',
          team: team || '',
          teams: team ? [team] : [],
          teamsByYear: tid ? { [year]: tid } : {},
          accolades: [],
          allAmericans: [],
          allConference: [],
          statsByYear: {},
          movements: []
        }

        // Add the honor to the new player
        if (honorType === 'awards') {
          newPlayer.accolades.push({
            year,
            award: honor.award,
            team: team,
            position: position,
            class: honor.class
          })
        } else if (honorType === 'allAmericans') {
          newPlayer.allAmericans.push({
            year,
            designation: honor.designation,
            position: position,
            school: team,
            class: honor.class
          })
        } else if (honorType === 'allConference') {
          newPlayer.allConference.push({
            year,
            designation: honor.designation,
            position: position,
            school: team,
            class: honor.class
          })
        }

        return newPlayer
      }

      // Helper: Process a single honor entry
      const processHonorEntry = (honorType, entry, year) => {
        // Get player info from entry
        const playerName = entry.player || entry.name
        const playerTeam = (entry.school || entry.team || '').toUpperCase()
        const playerPosition = entry.position || ''

        // Skip entries without a name or coach awards
        if (!playerName) return { action: 'skip' }
        if (entry.award && entry.award.toLowerCase().includes('coach')) return { action: 'skip' }

        // Find matching player
        const match = findMatchingPlayer(playerName, playerTeam, year, existingPlayers)

        if (match.matchType === 'exact' || match.matchType === 'transfer') {
          // Found a matching player (auto-confirm transfers)
          const player = match.player
          const playerIdx = existingPlayers.findIndex(p => p.pid === player.pid)

          if (playerIdx === -1) return { action: 'skip' }

          // Check if honor already exists
          if (playerHasHonor(player, honorType, entry, year)) {
            return { action: 'skip', reason: 'already_has' }
          }

          // Add honor to player
          existingPlayers[playerIdx] = addHonorToPlayer(player, honorType, entry, year, playerTeam)
          return { action: 'linked', playerName: player.name }
        } else {
          // No match - create new player
          const newPlayer = createPlayerForHonor(playerName, playerPosition, playerTeam, honorType, entry, year)
          existingPlayers.push(newPlayer)
          return { action: 'created', playerName: playerName }
        }
      }

      // Process all awards
      for (const [yearStr, yearAwards] of Object.entries(awardsByYear)) {
        const year = parseInt(yearStr, 10)
        if (isNaN(year)) continue

        // Awards are stored as { heismanTrophy: { player, position, team, class }, ... }
        for (const [awardKey, awardData] of Object.entries(yearAwards)) {
          if (!awardData || !awardData.player) continue
          // Skip coach awards (bearBryantCoachOfTheYear, etc.)
          if (awardKey.toLowerCase().includes('coach')) continue

          // Convert camelCase to readable, capitalize first letter of each word
          const awardName = awardKey
            .replace(/([A-Z])/g, ' $1')
            .trim()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')

          const entry = {
            ...awardData,
            award: awardName,
          }

          const result = processHonorEntry('awards', entry, year)
          if (result.action === 'linked') linkedCount++
          else if (result.action === 'created') createdCount++
          else skippedCount++
        }
      }

      // Process All-Americans and All-Conference
      for (const [yearStr, yearData] of Object.entries(allAmericansByYear)) {
        const year = parseInt(yearStr, 10)
        if (isNaN(year)) continue

        // All-Americans
        const allAmericans = yearData.allAmericans || []
        for (const entry of allAmericans) {
          if (!entry.player) continue
          const result = processHonorEntry('allAmericans', entry, year)
          if (result.action === 'linked') linkedCount++
          else if (result.action === 'created') createdCount++
          else skippedCount++
        }

        // All-Conference
        const allConference = yearData.allConference || []
        for (const entry of allConference) {
          if (!entry.player) continue
          const result = processHonorEntry('allConference', entry, year)
          if (result.action === 'linked') linkedCount++
          else if (result.action === 'created') createdCount++
          else skippedCount++
        }

        // All-Conference by conference (newer structure)
        const allConferenceByConference = yearData.allConferenceByConference || {}
        for (const [confName, confData] of Object.entries(allConferenceByConference)) {
          const confEntries = confData.allConference || []
          for (const entry of confEntries) {
            if (!entry.player) continue
            const result = processHonorEntry('allConference', entry, year)
            if (result.action === 'linked') linkedCount++
            else if (result.action === 'created') createdCount++
            else skippedCount++
          }
        }
      }

      console.log(`[HonorsSync] Complete: linked=${linkedCount}, created=${createdCount}, skipped=${skippedCount}`)

      // Save updated players
      if (linkedCount > 0 || createdCount > 0) {
        await updateDynasty(currentDynasty.id, {
          players: existingPlayers,
          nextPID: nextPID
        })
        setHonorsSyncStatus({
          success: true,
          message: `Linked ${linkedCount} honors, created ${createdCount} players`
        })
      } else {
        setHonorsSyncStatus({
          success: true,
          message: 'All honors already synced!'
        })
      }
    } catch (error) {
      console.error('[HonorsSync] Error:', error)
      setHonorsSyncStatus({
        success: false,
        message: 'Sync failed: ' + error.message
      })
    }
  }

  // Get game display info for the deletion list
  const getGameDisplayInfo = (game) => {
    const year = game.year || '?'
    const week = game.week || '?'

    // Get team names
    let team1Name = 'Unknown'
    let team2Name = 'Unknown'

    if (game.team1Tid && currentDynasty.teams?.[game.team1Tid]) {
      team1Name = currentDynasty.teams[game.team1Tid].name || currentDynasty.teams[game.team1Tid].abbr || `Team ${game.team1Tid}`
    } else if (game.team1Tid && TEAMS[game.team1Tid]) {
      team1Name = TEAMS[game.team1Tid].name || TEAMS[game.team1Tid].abbr || `Team ${game.team1Tid}`
    } else if (game.userTeam) {
      team1Name = game.userTeam
    } else if (game.team1) {
      team1Name = game.team1
    }

    if (game.team2Tid && currentDynasty.teams?.[game.team2Tid]) {
      team2Name = currentDynasty.teams[game.team2Tid].name || currentDynasty.teams[game.team2Tid].abbr || `Team ${game.team2Tid}`
    } else if (game.team2Tid && TEAMS[game.team2Tid]) {
      team2Name = TEAMS[game.team2Tid].name || TEAMS[game.team2Tid].abbr || `Team ${game.team2Tid}`
    } else if (game.opponent) {
      team2Name = game.opponent
    } else if (game.team2) {
      team2Name = game.team2
    }

    // Determine game type display
    let typeDisplay = 'Regular'
    if (game.isConferenceChampionship || game.gameType === 'conference_championship') typeDisplay = 'CCG'
    else if (game.isBowlGame || game.gameType === 'bowl') typeDisplay = game.bowlName || 'Bowl'
    else if (game.isCFPFirstRound || game.gameType === 'cfp_first_round') typeDisplay = 'CFP R1'
    else if (game.isCFPQuarterfinal || game.gameType === 'cfp_quarterfinal') typeDisplay = 'CFP QF'
    else if (game.isCFPSemifinal || game.gameType === 'cfp_semifinal') typeDisplay = 'CFP SF'
    else if (game.isCFPChampionship || game.gameType === 'cfp_championship') typeDisplay = 'CFP NC'

    const score = (game.team1Score !== null && game.team1Score !== undefined)
      ? `${game.team1Score}-${game.team2Score}`
      : 'No Score'

    return { year, week, team1Name, team2Name, typeDisplay, score }
  }

  // Repair CFP game slot assignments AND add tid fields to legacy data
  // Fixes: 1) misaligned games, 2) missing tid in seeds, 3) missing tid in games
  const handleRepairCFPGames = async () => {
    setCfpRepairStatus('running')
    try {
      const games = currentDynasty.games || []
      const cfpBowlConfigByYear = currentDynasty.cfpBowlConfigByYear || {}
      const cfpSeedsByYear = currentDynasty.cfpSeedsByYear || {}
      let fixedCount = 0
      let checkedCount = 0
      let seedsFixedCount = 0

      // PHASE 1: Fix CFP seeds - add tid where missing
      const updatedCfpSeeds = {}
      for (const [year, seeds] of Object.entries(cfpSeedsByYear)) {
        if (!Array.isArray(seeds)) continue
        let yearSeedsFixed = false
        const fixedSeeds = seeds.map(seed => {
          if (!seed) return seed
          if (seed.tid) return seed // Already has tid
          if (!seed.team) return seed // No team abbreviation to look up

          // Look up tid from abbreviation
          const tid = getTidFromAbbr(seed.team)
          if (tid) {
            yearSeedsFixed = true
            seedsFixedCount++
            console.log(`[CFP Repair] Seed ${seed.seed}: Added tid ${tid} for ${seed.team}`)
            return { ...seed, tid }
          }
          return seed
        })
        updatedCfpSeeds[year] = fixedSeeds
        if (yearSeedsFixed) {
          console.log(`[CFP Repair] Fixed seeds for year ${year}`)
        }
      }

      // Helper: Reverse lookup - find which seed a bowl is assigned to in the config
      const getSeedForBowl = (bowlName, bowlConfig) => {
        const config = bowlConfig || DEFAULT_BOWL_CONFIG
        for (let seed = 1; seed <= 4; seed++) {
          if (config[`seed${seed}`] === bowlName) return seed
        }
        // Fallback to default config
        for (let seed = 1; seed <= 4; seed++) {
          if (DEFAULT_BOWL_CONFIG[`seed${seed}`] === bowlName) return seed
        }
        return null
      }

      // Helper: Find SF slot by bowl name
      const getSFSlotForBowl = (bowlName, bowlConfig) => {
        const config = bowlConfig || DEFAULT_BOWL_CONFIG
        if (config.sf1 === bowlName || (!config.sf1 && DEFAULT_BOWL_CONFIG.sf1 === bowlName)) return 'cfpsf1'
        if (config.sf2 === bowlName || (!config.sf2 && DEFAULT_BOWL_CONFIG.sf2 === bowlName)) return 'cfpsf2'
        // Fallback to defaults
        if (bowlName === 'Peach Bowl') return 'cfpsf1'
        if (bowlName === 'Fiesta Bowl') return 'cfpsf2'
        return null
      }

      // PHASE 2: Fix CFP games - add tid fields and fix slots
      const updatedGames = games.map(game => {
        // Helper: detect if a game is CFP based on cfpSlot, id pattern, or boolean flags
        const isCFPGame = () => {
          if (game.isCFPQuarterfinal || game.isCFPSemifinal || game.isCFPChampionship || game.isCFPFirstRound) return true
          if (game.cfpSlot && game.cfpSlot.startsWith('cfp')) return true
          if (game.id && (game.id.startsWith('cfpfr') || game.id.startsWith('cfpqf') || game.id.startsWith('cfpsf') || game.id.startsWith('cfpnc'))) return true
          return false
        }

        if (!isCFPGame()) {
          return game
        }

        const year = game.year
        const bowlConfig = cfpBowlConfigByYear[year] || {}
        checkedCount++

        // Add tid fields if missing
        let updatedGame = { ...game }
        let gameModified = false

        // CRITICAL FIX: Determine correct gameType and boolean flags from cfpSlot or ID pattern
        const slotId = game.cfpSlot || (game.id && game.id.match(/^(cfp[a-z]+\d?)-\d+$/)?.[1])
        if (slotId) {
          let correctGameType, correctFlag, correctRound
          if (slotId.startsWith('cfpfr')) {
            correctGameType = GAME_TYPES.CFP_FIRST_ROUND
            correctFlag = 'isCFPFirstRound'
            correctRound = 'first_round'
          } else if (slotId.startsWith('cfpqf')) {
            correctGameType = GAME_TYPES.CFP_QUARTERFINAL
            correctFlag = 'isCFPQuarterfinal'
            correctRound = 'quarterfinal'
          } else if (slotId.startsWith('cfpsf')) {
            correctGameType = GAME_TYPES.CFP_SEMIFINAL
            correctFlag = 'isCFPSemifinal'
            correctRound = 'semifinal'
          } else if (slotId === 'cfpnc') {
            correctGameType = GAME_TYPES.CFP_CHAMPIONSHIP
            correctFlag = 'isCFPChampionship'
            correctRound = 'championship'
          }

          if (correctGameType && updatedGame.gameType !== correctGameType) {
            console.log(`[CFP Repair] Fixing gameType for ${game.id}: ${game.gameType} -> ${correctGameType}`)
            updatedGame.gameType = correctGameType
            gameModified = true
          }

          // Fix boolean flags - set correct one true, others false
          if (correctFlag) {
            const allFlags = ['isCFPFirstRound', 'isCFPQuarterfinal', 'isCFPSemifinal', 'isCFPChampionship']
            for (const flag of allFlags) {
              const shouldBeTrue = flag === correctFlag
              if (!!updatedGame[flag] !== shouldBeTrue) {
                updatedGame[flag] = shouldBeTrue
                if (shouldBeTrue) {
                  console.log(`[CFP Repair] Setting ${flag}=true for ${game.id}`)
                }
                gameModified = true
              }
            }
          }

          if (correctRound && updatedGame.cfpRound !== correctRound) {
            updatedGame.cfpRound = correctRound
            gameModified = true
          }
        }

        // Add team1Tid if missing but team1 exists
        if (!updatedGame.team1Tid && updatedGame.team1) {
          const tid = getTidFromAbbr(updatedGame.team1)
          if (tid) {
            updatedGame.team1Tid = tid
            gameModified = true
          }
        }

        // Add team2Tid if missing but team2 exists
        if (!updatedGame.team2Tid && updatedGame.team2) {
          const tid = getTidFromAbbr(updatedGame.team2)
          if (tid) {
            updatedGame.team2Tid = tid
            gameModified = true
          }
        }

        // Add winnerTid if missing but winner exists
        if (!updatedGame.winnerTid && updatedGame.winner) {
          const tid = getTidFromAbbr(updatedGame.winner)
          if (tid) {
            updatedGame.winnerTid = tid
            gameModified = true
          }
        }

        // Also try to compute winner from scores if not set
        if (!updatedGame.winner && updatedGame.team1Score !== null && updatedGame.team2Score !== null) {
          updatedGame.winner = updatedGame.team1Score > updatedGame.team2Score ? updatedGame.team1 : updatedGame.team2
          if (updatedGame.winner) {
            updatedGame.winnerTid = getTidFromAbbr(updatedGame.winner)
            gameModified = true
          }
        }

        if (gameModified) {
          console.log(`[CFP Repair] Added tid fields to ${updatedGame.id || 'game'}`)
          fixedCount++
        }

        game = updatedGame

        // Handle Quarterfinals - find correct slot by bye seed (which top-4 seed is in the game)
        if (game.isCFPQuarterfinal) {
          const cfpSeeds = currentDynasty.cfpSeedsByYear?.[year] || []

          // Find which bye seed (1-4) is in this game - this is the most reliable method
          const findByeSeed = () => {
            for (let seed = 1; seed <= 4; seed++) {
              const seedEntry = cfpSeeds.find(s => s.seed === seed)
              if (seedEntry) {
                // Check if this seed's team is in the game (by tid or abbr)
                if (seedEntry.tid && (game.team1Tid === seedEntry.tid || game.team2Tid === seedEntry.tid)) {
                  return seed
                }
                if (seedEntry.team && (game.team1 === seedEntry.team || game.team2 === seedEntry.team)) {
                  return seed
                }
              }
            }
            // Fallback to bowl name lookup (less reliable with custom configs)
            if (game.bowlName) {
              return getSeedForBowl(game.bowlName, bowlConfig)
            }
            return null
          }

          const seed = findByeSeed()
          if (seed) {
            const correctSlot = SEED_TO_SLOT[seed]
            const correctId = getCFPGameId(correctSlot, year)

            if (game.cfpSlot !== correctSlot || game.id !== correctId) {
              console.log(`[CFP Repair] QF seed ${seed} (${game.bowlName}): ${game.cfpSlot} -> ${correctSlot}, id: ${game.id} -> ${correctId}`)
              fixedCount++
              return {
                ...game,
                cfpSlot: correctSlot,
                id: correctId,
                cfpRound: 'quarterfinal'
              }
            }
          }
        }

        // Handle Semifinals
        if (game.isCFPSemifinal && game.bowlName) {
          const correctSlot = getSFSlotForBowl(game.bowlName, bowlConfig)
          if (correctSlot) {
            const correctId = getCFPGameId(correctSlot, year)

            if (game.cfpSlot !== correctSlot || game.id !== correctId) {
              console.log(`[CFP Repair] SF ${game.bowlName}: ${game.cfpSlot} -> ${correctSlot}, id: ${game.id} -> ${correctId}`)
              fixedCount++
              return {
                ...game,
                cfpSlot: correctSlot,
                id: correctId,
                cfpRound: 'semifinal'
              }
            }
          }
        }

        // Handle Championship
        if (game.isCFPChampionship) {
          const correctSlot = 'cfpnc'
          const correctId = getCFPGameId(correctSlot, year)

          if (game.cfpSlot !== correctSlot || game.id !== correctId) {
            console.log(`[CFP Repair] NC: ${game.cfpSlot} -> ${correctSlot}, id: ${game.id} -> ${correctId}`)
            fixedCount++
            return {
              ...game,
              cfpSlot: correctSlot,
              id: correctId,
              cfpRound: 'championship'
            }
          }
        }

        // Handle First Round (slot based on seed matchup)
        if (game.isCFPFirstRound) {
          // First round slots are determined by seed pairs, not bowl names
          // cfpfr1: 5v12, cfpfr2: 8v9, cfpfr3: 6v11, cfpfr4: 7v10
          const seedPairs = {
            'cfpfr1': [5, 12],
            'cfpfr2': [8, 9],
            'cfpfr3': [6, 11],
            'cfpfr4': [7, 10]
          }

          // Find correct slot based on seeds
          let correctSlot = null
          for (const [slot, [s1, s2]] of Object.entries(seedPairs)) {
            if ((game.seed1 === s1 && game.seed2 === s2) || (game.seed1 === s2 && game.seed2 === s1)) {
              correctSlot = slot
              break
            }
          }

          if (correctSlot) {
            const correctId = getCFPGameId(correctSlot, year)
            if (game.cfpSlot !== correctSlot || game.id !== correctId) {
              console.log(`[CFP Repair] FR ${game.seed1}v${game.seed2}: ${game.cfpSlot} -> ${correctSlot}`)
              fixedCount++
              return {
                ...game,
                cfpSlot: correctSlot,
                id: correctId,
                cfpRound: 'first_round'
              }
            }
          }
        }

        return game
      })

      // PHASE 3: Re-propagate winners from all completed CFP games
      // This ensures SF/NC shells have correct teams after slot fixes
      let gamesAfterPropagation = [...updatedGames]
      let propagatedCount = 0

      // Process games in order: FR -> QF -> SF (NC doesn't propagate)
      const cfpOrder = ['isCFPFirstRound', 'isCFPQuarterfinal', 'isCFPSemifinal']
      for (const roundFlag of cfpOrder) {
        const roundGames = gamesAfterPropagation.filter(g => g[roundFlag] && g.cfpSlot)
        for (const game of roundGames) {
          // Skip games without scores
          if (game.team1Score === null || game.team1Score === undefined ||
              game.team2Score === null || game.team2Score === undefined) {
            continue
          }

          // Re-propagate winner
          const beforePropagation = JSON.stringify(gamesAfterPropagation.map(g => ({ id: g.id, team1Tid: g.team1Tid, team2Tid: g.team2Tid })))
          gamesAfterPropagation = propagateCFPWinner(gamesAfterPropagation, game)
          const afterPropagation = JSON.stringify(gamesAfterPropagation.map(g => ({ id: g.id, team1Tid: g.team1Tid, team2Tid: g.team2Tid })))

          if (beforePropagation !== afterPropagation) {
            console.log(`[CFP Repair] Re-propagated winner from ${game.cfpSlot}`)
            propagatedCount++
          }
        }
      }

      if (propagatedCount > 0) {
        console.log(`[CFP Repair] Phase 3: Re-propagated ${propagatedCount} winners`)
      }

      // PHASE 4: Fix bowl names based on user's configuration
      // Ensures bowl names match cfpBowlConfigByYear (single source of truth)
      let bowlNamesFixedCount = 0
      gamesAfterPropagation = gamesAfterPropagation.map(game => {
        // Only process CFP games with cfpSlot
        if (!game.cfpSlot) return game
        if (!game.isCFPQuarterfinal && !game.isCFPSemifinal) return game // Only QF and SF have bowl names

        const year = game.year
        const bowlConfig = cfpBowlConfigByYear[year] || DEFAULT_BOWL_CONFIG
        const correctBowlName = getBowlForSlot(game.cfpSlot, bowlConfig)

        if (correctBowlName && game.bowlName !== correctBowlName) {
          console.log(`[CFP Repair] Bowl name fix: ${game.cfpSlot} "${game.bowlName}" -> "${correctBowlName}"`)
          bowlNamesFixedCount++
          return { ...game, bowlName: correctBowlName }
        }

        return game
      })

      if (bowlNamesFixedCount > 0) {
        console.log(`[CFP Repair] Phase 4: Fixed ${bowlNamesFixedCount} bowl names`)
      }

      const totalFixed = fixedCount + seedsFixedCount + propagatedCount + bowlNamesFixedCount
      if (totalFixed > 0) {
        const updates = { games: gamesAfterPropagation }
        // Also update seeds if any were fixed
        if (seedsFixedCount > 0) {
          updates.cfpSeedsByYear = updatedCfpSeeds
        }
        await updateDynasty(currentDynasty.id, updates)
        const messages = []
        if (fixedCount > 0) messages.push(`${fixedCount} games`)
        if (seedsFixedCount > 0) messages.push(`${seedsFixedCount} seeds`)
        if (propagatedCount > 0) messages.push(`${propagatedCount} propagations`)
        if (bowlNamesFixedCount > 0) messages.push(`${bowlNamesFixedCount} bowl names`)
        setCfpRepairStatus({ success: true, message: `Fixed ${messages.join(', ')} across ${checkedCount} CFP games` })
      } else {
        setCfpRepairStatus({ success: true, message: `All ${checkedCount} CFP games are correctly aligned!` })
      }
    } catch (error) {
      console.error('[CFP Repair] Error:', error)
      setCfpRepairStatus({ success: false, message: 'Repair failed: ' + error.message })
    }
  }

  // Repair Conference Championship games - add missing conference field
  const handleRepairCCGames = async () => {
    setCcgRepairStatus('running')
    try {
      const games = currentDynasty.games || []
      const customConferences = currentDynasty?.conferencesByYear?.[currentDynasty?.currentYear]
      let fixedCount = 0
      let checkedCount = 0

      const updatedGames = games.map(game => {
        // Only process Conference Championship games
        if (!game.isConferenceChampionship && game.gameType !== 'conference_championship') {
          return game
        }

        checkedCount++

        // If it already has a conference field, skip it
        if (game.conference) {
          return game
        }

        // Detect conference from teams
        // Get team abbreviations from game
        let team1Abbr = game.team1
        let team2Abbr = game.team2

        // Try to get abbr from tid if not directly available
        if (!team1Abbr && game.team1Tid) {
          const team = currentDynasty?.teams?.[game.team1Tid] || TEAMS[game.team1Tid]
          team1Abbr = team?.abbr || getOriginalTeamAbbr(game.team1Tid)
        }
        if (!team2Abbr && game.team2Tid) {
          const team = currentDynasty?.teams?.[game.team2Tid] || TEAMS[game.team2Tid]
          team2Abbr = team?.abbr || getOriginalTeamAbbr(game.team2Tid)
        }

        // Also check legacy fields
        if (!team1Abbr) team1Abbr = game.userTeam
        if (!team2Abbr) team2Abbr = game.opponent

        if (!team1Abbr && !team2Abbr) {
          console.log(`[CCG Repair] Could not determine teams for game ${game.id}`)
          return game
        }

        // Get conference from either team
        const team1Conf = team1Abbr ? getTeamConference(team1Abbr, customConferences, currentDynasty?.teams) : null
        const team2Conf = team2Abbr ? getTeamConference(team2Abbr, customConferences, currentDynasty?.teams) : null

        // Use whichever conference we found (they should be the same for a conference championship)
        const conference = team1Conf || team2Conf

        if (conference) {
          console.log(`[CCG Repair] Game ${game.id}: Added conference "${conference}" (teams: ${team1Abbr} vs ${team2Abbr})`)
          fixedCount++
          return { ...game, conference }
        }

        console.log(`[CCG Repair] Could not determine conference for game ${game.id} (teams: ${team1Abbr} vs ${team2Abbr})`)
        return game
      })

      if (fixedCount > 0) {
        await updateDynasty(currentDynasty.id, { games: updatedGames })
        setCcgRepairStatus({ success: true, message: `Fixed ${fixedCount} of ${checkedCount} CCG games` })
      } else if (checkedCount === 0) {
        setCcgRepairStatus({ success: true, message: 'No Conference Championship games found' })
      } else {
        setCcgRepairStatus({ success: true, message: `All ${checkedCount} CCG games already have conference field!` })
      }
    } catch (error) {
      console.error('[CCG Repair] Error:', error)
      setCcgRepairStatus({ success: false, message: 'Repair failed: ' + error.message })
    }
  }

  const handleAnalyzeSize = () => {
    const result = analyzeDocumentSize(currentDynasty.id)
    if (result.success) setSizeAnalysis(result.analysis)
  }

  const handleOptimize = async () => {
    setOptimizeStatus('running')
    try {
      const result = await optimizeDocumentSize(currentDynasty.id, {
        cleanPlayers: true, removeOldBoxScores, keepBoxScoreYears: 2
      })
      setOptimizeStatus(result)
      if (result.success) handleAnalyzeSize()
    } catch (error) {
      setOptimizeStatus({ success: false, message: 'Optimization failed: ' + error.message })
    }
  }

  const handleSubcollectionMigration = async () => {
    setSubcollectionMigrationStatus('running')
    try {
      const result = await migrateToSubcollections(currentDynasty.id)
      setSubcollectionMigrationStatus(result)
      if (result.success) handleAnalyzeSize()
    } catch (error) {
      setSubcollectionMigrationStatus({ success: false, message: 'Migration failed: ' + error.message })
    }
  }

  // Compact Action Card
  const ActionCard = ({ icon, title, description, buttonText, onClick, status, variant = 'normal' }) => {
    const isRunning = status === 'running'
    const isDone = status && status !== 'running'
    const isDanger = variant === 'danger'

    return (
      <div
        className="rounded-lg p-4 flex flex-col h-full"
        style={{
          backgroundColor: isDanger ? '#fef2f2' : teamColors.secondary,
          border: isDanger ? '2px solid #fca5a5' : `2px solid ${teamColors.primary}20`
        }}
      >
        <div className="mb-3">
          <h3 className="font-semibold text-sm" style={{ color: isDanger ? '#b91c1c' : secondaryBgText }}>
            {title}
          </h3>
          <p className="text-xs mt-0.5 leading-relaxed" style={{ color: isDanger ? '#991b1b' : secondaryBgText, opacity: 0.7 }}>
            {description}
          </p>
        </div>

        <div className="mt-auto">
          <button
            onClick={onClick}
            disabled={isRunning}
            className="w-full px-3 py-1.5 rounded-md font-medium text-xs hover:opacity-90 transition-opacity disabled:opacity-50"
            style={{
              backgroundColor: isDanger ? '#dc2626' : teamColors.primary,
              color: isDanger ? '#fff' : primaryBgText
            }}
          >
            {isRunning ? 'Running...' : buttonText}
          </button>
          {isDone && (
            <p className={`text-xs mt-2 ${status.success ? 'text-green-600' : 'text-red-600'}`}>
              {status.success ? '✓' : '✗'} {status.message}
            </p>
          )}
        </div>
      </div>
    )
  }

  // Section Header
  const SectionHeader = ({ title, subtitle }) => (
    <div className="mb-3">
      <h2 className="text-base font-bold" style={{ color: secondaryBgText }}>{title}</h2>
      {subtitle && <p className="text-xs" style={{ color: secondaryBgText, opacity: 0.6 }}>{subtitle}</p>}
    </div>
  )

  // Find teambuilder teams
  const teams = currentDynasty?.teams || {}
  const teambuilderTeams = Object.values(teams).filter(t => t.isCustom)

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div
        className="rounded-xl p-4 sm:p-5"
        style={{ backgroundColor: teamColors.primary, boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg sm:text-xl font-bold" style={{ color: primaryBgText }}>Danger Zone</h1>
            <p className="text-xs" style={{ color: primaryBgText, opacity: 0.8 }}>Data repair & maintenance</p>
          </div>
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ backgroundColor: `${primaryBgText}20`, color: primaryBgText }}
          >
            {showHelp ? 'Hide Help' : 'Help'}
          </button>
        </div>
      </div>

      {/* Help Section (Collapsible) */}
      {showHelp && (
        <div className="rounded-lg p-4 text-sm" style={{ backgroundColor: '#f0f9ff', border: '1px solid #bae6fd' }}>
          <h3 className="font-semibold text-blue-800 mb-2">When to use these tools:</h3>
          <div className="grid sm:grid-cols-2 gap-2 text-xs text-blue-700">
            <div><strong>Fix Roster:</strong> Departed players still showing on roster</div>
            <div><strong>Sync Recruiting:</strong> Missing data on recruiting pages</div>
            <div><strong>Remove Duplicates:</strong> Wrong win/loss record</div>
            <div><strong>Repair CFP:</strong> CFP games open wrong page or show wrong bowl names</div>
            <div><strong>Repair CCG:</strong> Conference championship games not showing in history</div>
            <div><strong>Clear Cache:</strong> Google Sheets errors or stale data</div>
            <div><strong>Migrate Career:</strong> Gaps in player year-by-year data</div>
            <div><strong>Database Migration:</strong> "Exceeds maximum size" errors</div>
          </div>
        </div>
      )}

      {/* Warning Banner */}
      <div className="rounded-lg p-3 flex items-center justify-between gap-3" style={{ backgroundColor: '#fef3c7', border: '2px solid #f59e0b' }}>
        <p className="text-xs text-amber-800">
          <strong>Back up first!</strong> Download a backup before making changes.
        </p>
        <button
          onClick={() => exportDynasty && exportDynasty(dynastyId)}
          className="px-3 py-1.5 rounded-md text-xs font-medium bg-amber-600 text-white hover:bg-amber-700 transition-colors flex-shrink-0"
        >
          Download Backup
        </button>
      </div>

      {/* Quick Fixes Section */}
      <div>
        <SectionHeader
          title="Quick Fixes"
          subtitle="Common issues, safe to run"
        />
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
          <ActionCard
            title="Fix Roster"
            description="Removes departed players, fixes recruit assignments"
            buttonText="Fix Roster"
            onClick={handleRosterCleanup}
            status={rosterCleanupStatus}
          />
          <ActionCard
            title="Sync Recruiting"
            description="Updates recruiting pages from player data"
            buttonText="Sync Data"
            onClick={handleSyncRecruitingData}
            status={recruitingSyncStatus}
          />
          <ActionCard
            title="Remove Duplicates"
            description="Fixes duplicate games causing wrong records"
            buttonText="Remove"
            onClick={handleDuplicateGameCleanup}
            status={duplicateGameCleanupStatus}
          />
          <ActionCard
            title="Repair CFP Games"
            description="Fixes misaligned CFP bracket slots, bowl names, and game links"
            buttonText="Repair CFP"
            onClick={handleRepairCFPGames}
            status={cfpRepairStatus}
          />
          <ActionCard
            title="Repair CCG Games"
            description="Adds missing conference field to Conference Championship games"
            buttonText="Repair CCG"
            onClick={handleRepairCCGames}
            status={ccgRepairStatus}
          />
        </div>
      </div>

      {/* Delete Specific Game Section */}
      <div>
        <SectionHeader
          title="Delete Specific Game"
          subtitle="Manually remove a game that shouldn't exist"
        />
        <div className="rounded-lg p-4" style={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}>
          {!showGameDeletion ? (
            <button
              onClick={() => setShowGameDeletion(true)}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white transition-colors"
            >
              Show Games for Deletion
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-300">Select a game to delete:</p>
                <button
                  onClick={() => { setShowGameDeletion(false); setSelectedGameToDelete(null); }}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  Hide
                </button>
              </div>

              {/* Filter by year */}
              <select
                className="w-full px-3 py-2 rounded-lg text-sm bg-gray-700 text-white border border-gray-600"
                value={selectedGameToDelete || ''}
                onChange={(e) => setSelectedGameToDelete(e.target.value)}
              >
                <option value="">-- Select a game --</option>
                {(currentDynasty.games || [])
                  .sort((a, b) => {
                    // Sort by year desc, then by week
                    if (b.year !== a.year) return (b.year || 0) - (a.year || 0)
                    const weekA = typeof a.week === 'number' ? a.week : 99
                    const weekB = typeof b.week === 'number' ? b.week : 99
                    return weekA - weekB
                  })
                  .map(game => {
                    const info = getGameDisplayInfo(game)
                    return (
                      <option key={game.id} value={game.id}>
                        {info.year} Wk{info.week} - {info.team1Name} vs {info.team2Name} ({info.score}) [{info.typeDisplay}]
                      </option>
                    )
                  })}
              </select>

              {selectedGameToDelete && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleDeleteGame(selectedGameToDelete)}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white transition-colors"
                  >
                    Delete Selected Game
                  </button>
                  {gameDeletionStatus && (
                    <span className={`text-sm ${gameDeletionStatus.success ? 'text-green-400' : 'text-red-400'}`}>
                      {gameDeletionStatus.message}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Advanced Player Fixes */}
      <div>
        <SectionHeader
          title="Player Data Repair"
          subtitle="Advanced fixes for player records"
        />
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
          <ActionCard
            title="Sync Honors to Players"
            description="Links awards, All-Americans & All-Conference to player records"
            buttonText="Sync Honors"
            onClick={handleSyncHonorsToPlayers}
            status={honorsSyncStatus}
          />
          <ActionCard
            title="Migrate Career Data"
            description="Fills gaps in player career timelines"
            buttonText="Migrate"
            onClick={handleMigration}
            status={migrationStatus}
          />
          <ActionCard
            title="Fix Transfers"
            description="Removes transferred/graduated players"
            buttonText="Fix"
            onClick={handleFixTransfers}
            status={transferFixStatus}
          />
          <ActionCard
            title="Fix Ghost Players"
            description="Fixes ghost roster entries"
            buttonText="Fix"
            onClick={handleOrphanCleanup}
            status={orphanCleanupStatus}
          />
        </div>
      </div>

      {/* Storage & Database Section */}
      <div>
        <SectionHeader
          title="Storage & Database"
        />

        <div className="rounded-lg p-4" style={{ backgroundColor: teamColors.secondary, border: `2px solid ${teamColors.primary}20` }}>
          {/* Migration Status Badge */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${currentDynasty._subcollectionsMigrated ? 'bg-green-500' : 'bg-yellow-500'}`} />
              <span className="text-sm font-medium" style={{ color: secondaryBgText }}>
                {currentDynasty._subcollectionsMigrated ? 'Subcollection Storage (Unlimited)' : 'Legacy Storage (1MB Limit)'}
              </span>
            </div>
            {!sizeAnalysis && (
              <button
                onClick={handleAnalyzeSize}
                className="px-3 py-1 rounded text-xs font-medium"
                style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
              >
                Analyze
              </button>
            )}
          </div>

          {sizeAnalysis && (
            <div className="space-y-4">
              {/* Size Bar */}
              <div>
                <div className="flex justify-between text-xs mb-1" style={{ color: secondaryBgText }}>
                  <span>{sizeAnalysis.isMigrated ? sizeAnalysis.mainDocTotalKB : sizeAnalysis.totalKB} KB</span>
                  <span>{sizeAnalysis.isMigrated ? sizeAnalysis.mainDocPercentUsed : sizeAnalysis.percentUsed}% of 1MB</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      parseFloat(sizeAnalysis.isMigrated ? sizeAnalysis.mainDocPercentUsed : sizeAnalysis.percentUsed) > 90 ? 'bg-red-500' :
                      parseFloat(sizeAnalysis.isMigrated ? sizeAnalysis.mainDocPercentUsed : sizeAnalysis.percentUsed) > 70 ? 'bg-yellow-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(100, parseFloat(sizeAnalysis.isMigrated ? sizeAnalysis.mainDocPercentUsed : sizeAnalysis.percentUsed))}%` }}
                  />
                </div>
              </div>

              {/* Subcollection Stats (if migrated) */}
              {sizeAnalysis.isMigrated && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2 rounded bg-blue-50 text-center">
                    <div className="text-lg font-bold text-blue-800">{sizeAnalysis.subcollections.players.count}</div>
                    <div className="text-xs text-blue-600">Players ({sizeAnalysis.subcollections.players.sizeKB} KB)</div>
                  </div>
                  <div className="p-2 rounded bg-purple-50 text-center">
                    <div className="text-lg font-bold text-purple-800">{sizeAnalysis.subcollections.games.count}</div>
                    <div className="text-xs text-purple-600">Games ({sizeAnalysis.subcollections.games.sizeKB} KB)</div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-200">
                <button
                  onClick={handleAnalyzeSize}
                  className="px-3 py-1.5 rounded text-xs font-medium border"
                  style={{ borderColor: teamColors.primary, color: teamColors.primary }}
                >
                  Refresh
                </button>

                {!currentDynasty._subcollectionsMigrated && (
                  <>
                    <button
                      onClick={handleSubcollectionMigration}
                      disabled={subcollectionMigrationStatus === 'running'}
                      className="px-3 py-1.5 rounded text-xs font-medium text-white disabled:opacity-50"
                      style={{ backgroundColor: '#059669' }}
                    >
                      {subcollectionMigrationStatus === 'running' ? 'Migrating...' : 'Migrate to Subcollections'}
                    </button>

                    <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: secondaryBgText }}>
                      <input
                        type="checkbox"
                        checked={removeOldBoxScores}
                        onChange={(e) => setRemoveOldBoxScores(e.target.checked)}
                        className="w-3 h-3 rounded"
                      />
                      Remove old box scores
                    </label>

                    <button
                      onClick={handleOptimize}
                      disabled={optimizeStatus === 'running'}
                      className="px-3 py-1.5 rounded text-xs font-medium text-white disabled:opacity-50"
                      style={{ backgroundColor: '#dc2626' }}
                    >
                      {optimizeStatus === 'running' ? 'Optimizing...' : 'Optimize'}
                    </button>
                  </>
                )}
              </div>

              {/* Status Messages */}
              {(subcollectionMigrationStatus && subcollectionMigrationStatus !== 'running') && (
                <p className={`text-xs ${subcollectionMigrationStatus.success ? 'text-green-600' : 'text-red-600'}`}>
                  {subcollectionMigrationStatus.success ? '✓' : '✗'} {subcollectionMigrationStatus.message}
                </p>
              )}
              {(optimizeStatus && optimizeStatus !== 'running') && (
                <p className={`text-xs ${optimizeStatus.success ? 'text-green-600' : 'text-red-600'}`}>
                  {optimizeStatus.success ? '✓' : '✗'} {optimizeStatus.message}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Cache Section */}
      <div>
        <SectionHeader title="Cache" />
        <div className="grid sm:grid-cols-2 gap-3">
          <div
            className="rounded-lg p-4 flex flex-col h-full"
            style={{ backgroundColor: '#fef2f2', border: '2px solid #fca5a5' }}
          >
            <div className="flex items-start gap-3 mb-3">
              <svg className="w-5 h-5 flex-shrink-0 text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <div>
                <h3 className="font-semibold text-sm text-red-700">Clear Local Cache</h3>
                <p className="text-xs mt-0.5 leading-relaxed text-red-800 opacity-70">Clears Google Sheets tokens and temp data</p>
              </div>
            </div>
            <div className="mt-auto">
              <button
                onClick={handleClearCache}
                disabled={clearCacheStatus === 'running'}
                className="w-full px-3 py-1.5 rounded-md font-medium text-xs hover:opacity-90 transition-opacity disabled:opacity-50 bg-red-600 text-white"
              >
                {clearCacheStatus === 'running' ? 'Running...' : 'Clear Cache'}
              </button>
              {clearCacheStatus && clearCacheStatus !== 'running' && (
                <p className={`text-xs mt-2 ${clearCacheStatus.success ? 'text-green-600' : 'text-red-600'}`}>
                  {clearCacheStatus.success ? '✓' : '✗'} {clearCacheStatus.message}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Storage Tier Testing (Dev) */}
      <div>
        <SectionHeader
          title="Storage Tier Testing"
          subtitle="Dev tool - switch between IndexedDB and Firebase"
        />
        <div className="rounded-lg p-4" style={{ backgroundColor: '#f0fdf4', border: '2px solid #86efac' }}>
          {/* Current Status */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${currentStorageTier === STORAGE_TIER.FREE ? 'bg-blue-500' : 'bg-purple-500'}`} />
              <span className="text-sm font-medium text-gray-800">
                Current: <strong>{currentStorageTier === STORAGE_TIER.FREE ? 'IndexedDB (Free)' : 'Firebase (Premium)'}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs cursor-pointer text-gray-600">
                <input
                  type="checkbox"
                  checked={debugEnabled}
                  onChange={(e) => {
                    setDebugEnabled(e.target.checked)
                    storageService.setDebug(e.target.checked)
                  }}
                  className="w-3 h-3 rounded"
                />
                Debug logs
              </label>
            </div>
          </div>

          {/* Tier Toggle Buttons */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => {
                storageService.setTier(STORAGE_TIER.FREE)
                console.log('[StorageTierTest] Switched to IndexedDB (Free tier) - reloading page...')
                window.location.reload()
              }}
              className={`flex-1 px-3 py-2 rounded text-xs font-medium transition-all ${
                currentStorageTier === STORAGE_TIER.FREE
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              IndexedDB (Free)
            </button>
            <button
              onClick={() => {
                if (!user) {
                  alert('You must be logged in to test Firebase storage')
                  return
                }
                storageService.setTier(STORAGE_TIER.PREMIUM, user.uid)
                console.log('[StorageTierTest] Switched to Firebase (Premium tier) - reloading page...')
                window.location.reload()
              }}
              className={`flex-1 px-3 py-2 rounded text-xs font-medium transition-all ${
                currentStorageTier === STORAGE_TIER.PREMIUM
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Firebase (Premium)
            </button>
          </div>

          {/* Reset Button */}
          <button
            onClick={() => {
              storageService.clearPersistedTier()
              console.log('[StorageTierTest] Cleared persisted tier - reloading page...')
              window.location.reload()
            }}
            className="w-full px-3 py-1.5 rounded text-xs font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 mb-4"
          >
            Reset to Default (use user's actual tier)
          </button>

          {/* IndexedDB Info */}
          <div className="space-y-2 text-xs text-gray-600">
            <div className="flex justify-between">
              <span>User ID:</span>
              <span className="font-mono">{user?.uid || 'Not logged in'}</span>
            </div>
            <button
              onClick={async () => {
                const info = await indexedDBStorage.getStorageInfo()
                setStorageInfo(info)
              }}
              className="w-full px-3 py-1.5 rounded text-xs font-medium bg-gray-200 text-gray-700 hover:bg-gray-300"
            >
              Check IndexedDB Storage Usage
            </button>
            {storageInfo && (
              <div className="p-2 rounded bg-white border text-xs">
                <div>Used: {(storageInfo.used / 1024 / 1024).toFixed(2)} MB</div>
                <div>Quota: {(storageInfo.quota / 1024 / 1024).toFixed(0)} MB</div>
                <div>Usage: {storageInfo.percent}%</div>
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="mt-4 p-2 rounded bg-yellow-50 border border-yellow-200 text-xs text-yellow-800">
            <strong>Testing instructions:</strong>
            <ol className="list-decimal ml-4 mt-1 space-y-1">
              <li>Open browser console (F12) to see debug logs</li>
              <li>Switch between tiers (page will reload)</li>
              <li>Perform actions (save game, update roster, etc.)</li>
              <li>Watch console for [IndexedDB] or [Firebase] logs</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Teambuilder Section */}
      {teambuilderTeams.length > 0 && (
        <div>
          <SectionHeader
            title="Teambuilder Teams"
            subtitle={`${teambuilderTeams.length} custom team${teambuilderTeams.length > 1 ? 's' : ''}`}
          />

          <div className="grid gap-3">
            {teambuilderTeams.map(team => {
              const originalAbbr = getOriginalTeamAbbr(team.tid)
              const originalName = originalAbbr ? getTeamName(originalAbbr) : TEAMS[team.tid]?.name || 'Unknown'

              return (
                <div
                  key={team.tid}
                  className="rounded-lg p-4 flex items-center gap-4"
                  style={{ backgroundColor: team.secondaryColor || teamColors.secondary, border: `3px solid ${team.primaryColor || teamColors.primary}` }}
                >
                  {team.logo ? (
                    <img src={team.logo} alt={team.name} className="w-12 h-12 object-contain rounded bg-white p-1" />
                  ) : (
                    <div
                      className="w-12 h-12 rounded flex items-center justify-center font-bold text-sm"
                      style={{ backgroundColor: team.primaryColor, color: team.secondaryColor }}
                    >
                      {team.abbr}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm truncate" style={{ color: getContrastTextColor(team.secondaryColor || teamColors.secondary) }}>
                      {team.name}
                    </h3>
                    <p className="text-xs" style={{ color: getContrastTextColor(team.secondaryColor || teamColors.secondary), opacity: 0.7 }}>
                      {team.abbr} • Replaces {originalName}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => { setSelectedTeambuilderTid(team.tid); setShowTeambuilderEditModal(true) }}
                      className="px-3 py-1.5 rounded text-xs font-medium"
                      style={{ backgroundColor: team.primaryColor, color: getContrastTextColor(team.primaryColor) }}
                    >
                      Edit
                    </button>
                    <Link
                      to={`${pathPrefix}/team/${team.tid}`}
                      className="px-3 py-1.5 rounded text-xs font-medium border-2"
                      style={{ borderColor: team.primaryColor, color: team.primaryColor }}
                    >
                      View
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Teambuilder Edit Modal */}
      {selectedTeambuilderTid && (
        <TeambuilderEditModal
          isOpen={showTeambuilderEditModal}
          onClose={() => { setShowTeambuilderEditModal(false); setSelectedTeambuilderTid(null) }}
          team={currentDynasty?.teams?.[selectedTeambuilderTid]}
          tid={selectedTeambuilderTid}
          onSave={async (updates) => {
            const result = await updateTeambuilderTeam(currentDynasty.id, selectedTeambuilderTid, updates)
            if (!result.success) throw new Error(result.message)
          }}
        />
      )}
    </div>
  )
}
