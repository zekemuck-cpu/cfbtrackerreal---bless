import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useDynasty, propagateCFPWinner, GAME_TYPES, isPlayerOnRoster, rebuildRankByWeekFromCurrentState, syncGameRanksFromRankByWeek } from '../../context/DynastyContext'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../components/ui/Toast'
import { useConfirm } from '../../components/ui/ConfirmDialog'
import { useTeamColors } from '../../hooks/useTeamColors'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getTeamName } from '../../data/teamAbbreviations'
import { TEAMS, getOriginalTeamAbbr, getTidFromAbbr, resolveTid } from '../../data/teamRegistry'
import { getTeamConference } from '../../data/conferenceTeams'
import { storageService, STORAGE_TIER, indexedDBStorage } from '../../services/storage'
import TeambuilderEditModal from '../../components/TeambuilderEditModal'
import { SEED_TO_SLOT, getCFPGameId, DEFAULT_BOWL_CONFIG, getBowlForSlot } from '../../data/cfpConstants'
import { findMatchingPlayer, normalizePlayerName } from '../../utils/playerMatching'
import { migrateDynastyToV2 } from '../../data/migrateDynastyV2'
import { syncDerivedFieldsFromV2 } from '../../data/rosterModel'
import {
  PageHero,
  Card,
  Button,
  Badge,
  Modal,
  Input,
  Select,
  SectionHeader,
  LoadingState,
} from '../../components/ui'
import { doc, getDocFromServer, collection, getDocsFromServer } from 'firebase/firestore'
import { db } from '../../config/firebase'
import { saveWeeklyGamesChanges } from '../../services/dynastyService'

export default function DangerZone() {
  const { currentDynasty, analyzeDocumentSize, optimizeDocumentSize, migrateToSubcollections, updateDynasty, updateTeambuilderTeam, exportDynasty, isViewOnly, syncAllPlayersStats, saveWeekRecap, deleteWeekRecap } = useDynasty()
  const { user } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const { id: dynastyId } = useParams()
  const pathPrefix = usePathPrefix()
  useTeamColors(currentDynasty?.teamName, currentDynasty?.teams || currentDynasty?.customTeams)

  // Status states
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
  // CCG mis-flag cleanup state — finds games incorrectly tagged as
  // conference championships (e.g. Army-Navy was being auto-promoted
  // before the Week-15-only fix) and removes the flag.
  const [ccgMisflagStatus, setCcgMisflagStatus] = useState(null)
  // CCG restore state — re-flags games that look like CCGs but lost
  // the flag (e.g. an over-aggressive earlier version of the Unflag
  // tool that stripped any CCG without an exact Week 15 marker).
  const [ccgRestoreStatus, setCcgRestoreStatus] = useState(null)

  // Game deletion state
  const [showGameDeletion, setShowGameDeletion] = useState(false)
  const [selectedGameToDelete, setSelectedGameToDelete] = useState(null)
  const [gameDeletionStatus, setGameDeletionStatus] = useState(null)

  // Honors sync state
  const [honorsSyncStatus, setHonorsSyncStatus] = useState(null)

  // v2 Consolidation state
  const [v2ConsolidateStatus, setV2ConsolidateStatus] = useState(null)

  // Duplicate player merge state
  const [duplicateMergeStatus, setDuplicateMergeStatus] = useState(null)
  const [duplicateGroups, setDuplicateGroups] = useState(null) // Groups pending confirmation
  const [selectedMergeGroups, setSelectedMergeGroups] = useState(new Set()) // Which groups to merge

  // Preseason recap location fix state
  const [preseasonRecapFixStatus, setPreseasonRecapFixStatus] = useState(null)

  // Class data fix state
  const [classDataFixStatus, setClassDataFixStatus] = useState(null)
  const [advanceClassesStatus, setAdvanceClassesStatus] = useState(null)
  const [showAdvanceModal, setShowAdvanceModal] = useState(false)
  const [advanceSelections, setAdvanceSelections] = useState({}) // { pid: boolean }

  // Stats sync state
  const [statsSyncStatus, setStatsSyncStatus] = useState(null)
  const [statsSyncYear, setStatsSyncYear] = useState(currentDynasty?.currentYear || new Date().getFullYear())
  const [statsSyncSkipGamesPlayed, setStatsSyncSkipGamesPlayed] = useState(false) // Option to skip updating games played/snaps

  // Schedule link fix state
  const [scheduleLinkFixStatus, setScheduleLinkFixStatus] = useState(null)
  const [storageAnalysisStatus, setStorageAnalysisStatus] = useState(null)
  const [storageAnalysisDetail, setStorageAnalysisDetail] = useState(null)

  if (!currentDynasty) {
    return <LoadingState message="Loading..." />
  }

  if (isViewOnly) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card>
          <h2 className="text-display-md text-txt-primary m-0 mb-2">Danger Zone</h2>
          <p className="text-txt-secondary text-sm m-0">Danger Zone is not available in view-only mode.</p>
        </Card>
      </div>
    )
  }

  // Handlers
  const handleSyncAllStats = async () => {
    setStatsSyncStatus('running')
    try {
      await syncAllPlayersStats(currentDynasty.id, statsSyncYear, { skipGamesPlayed: statsSyncSkipGamesPlayed })
      const gamesWithBoxScores = (currentDynasty.games || []).filter(g =>
        g.boxScore && Number(g.year) === Number(statsSyncYear)
      ).length
      setStatsSyncStatus({
        success: true,
        message: `Synced stats from ${gamesWithBoxScores} game${gamesWithBoxScores !== 1 ? 's' : ''} in ${statsSyncYear}${statsSyncSkipGamesPlayed ? ' (kept games played)' : ''}`
      })
    } catch (error) {
      setStatsSyncStatus({ success: false, message: 'Sync failed: ' + error.message })
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

  // Diagnostic — measure each top-level field's contribution to the
  // ACTUAL Firestore main-doc size, not the in-memory React state size.
  // Critical distinction: after a subcollection migration, the
  // listener merges subcollection data back into dynasty.fieldByYear
  // shapes so consumers don't notice. If we measure currentDynasty
  // directly, the size doesn't drop after migration — even though the
  // Firestore doc DID shrink. So we read the main doc straight from
  // Firestore (server, no cache) and analyze that.
  //
  // Bytes are JSON.stringify().length, which understates Firestore's
  // on-disk size by some per-field metadata overhead but the relative
  // ranking of fields is what we care about.
  const handleAnalyzeStorage = async () => {
    setStorageAnalysisStatus('running')
    setStorageAnalysisDetail(null)
    try {
      if (!currentDynasty) throw new Error('No dynasty loaded')

      const TRANSIENT_FIELDS = new Set([
        '_firestoreId',
      ])

      const sizeOf = (value) => {
        try {
          return JSON.stringify(value === undefined ? null : value).length
        } catch (_) {
          return 0
        }
      }
      const fmt = (n) => {
        if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`
        if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
        return `${n} B`
      }

      // Source-of-truth for the main doc: read the live document from
      // the Firestore server, bypassing the SDK's cache. This is the
      // ONLY way to know what's actually counting against the 1 MiB
      // cap — currentDynasty in-memory has subcollection data merged
      // in and would lie about the doc size.
      let mainDocData = {}
      let serverFetchFailed = false
      try {
        const ref = doc(db, 'dynasties', currentDynasty.id)
        const snap = await getDocFromServer(ref)
        mainDocData = snap.exists() ? snap.data() : {}
      } catch (err) {
        // Could be offline, permissions, or rate-limit. Fall back to
        // measuring the in-memory dynasty (less accurate post-migration
        // but better than nothing) and flag the result so the user
        // doesn't trust it.
        console.warn('[StorageAnalysis] server fetch failed, falling back to in-memory:', err?.code || err?.message)
        mainDocData = currentDynasty
        serverFetchFailed = true
      }

      const entries = []
      let mainDocTotal = 0
      for (const [key, value] of Object.entries(mainDocData)) {
        if (TRANSIENT_FIELDS.has(key)) continue
        const bytes = sizeOf(value)
        mainDocTotal += bytes
        entries.push({ key, bytes })
      }
      entries.sort((a, b) => b.bytes - a.bytes)

      const lines = []
      if (serverFetchFailed) {
        lines.push('⚠️  COULD NOT READ FROM FIRESTORE — falling back to in-memory state.')
        lines.push('   Numbers may overstate the actual main-doc size. Check console for the error.')
        lines.push('')
      }
      lines.push(`Main dynasty doc: ${fmt(mainDocTotal)} of 1.00 MB cap (${(mainDocTotal / (1024 * 1024) * 100).toFixed(1)}%)`)
      lines.push('')
      lines.push('Top fields on the main doc:')
      const top = entries.slice(0, 30)
      for (const { key, bytes } of top) {
        if (bytes < 100) break
        const pct = mainDocTotal > 0 ? ((bytes / mainDocTotal) * 100).toFixed(1) : '0'
        lines.push(`  ${key.padEnd(40)} ${fmt(bytes).padStart(10)}   (${pct}%)`)
      }
      const restBytes = entries.slice(30).reduce((s, e) => s + e.bytes, 0)
      if (restBytes > 0) {
        lines.push(`  ${'(everything else)'.padEnd(40)} ${fmt(restBytes).padStart(10)}`)
      }

      // Subcollection summary from the in-memory state. This is just
      // an info panel; subcollection docs each have their own 1 MiB
      // cap so individual sizes here don't matter for the cap question
      // — what matters is per-doc size, which neither players nor
      // games comes close to since each record is its own doc.
      lines.push('')
      lines.push('Subcollections (loaded into React state, not on main doc):')
      const subFields = ['players', 'games', 'weekRecapsByYear']
      // Plus all the seasonal fields that have been migrated to
      // dynasties/{id}/seasons/{year} as of cb40757.
      const SEASONAL_NAMES = [
        'allAmericansByYear', 'awardsByYear', 'bowlEligibilityDataByYear', 'bowlGamesByYear', 'bowlResultsByYear',
        'cfpBowlConfigByYear', 'cfpResultsByYear', 'cfpSeedsByYear', 'conferenceChampionshipDataByYear',
        'conferenceChampionshipsByYear', 'conferenceStandingsByYear', 'customConferencesByYear',
        'detailedStatsByYear', 'draftResultsByYear', 'finalPollsByYear', 'fringeCaseClassByYear',
        'lockedCoachingStaffByYear', 'playersLeavingByYear', 'playerStatsByYear', 'portalTransferClassByYear',
        'positionChangesByYear', 'preseasonRankingsByYear', 'rankingsByYear', 'rankingsHistoryByYear',
        'recruitOverallsByYear', 'seasonAwardsByYear', 'teamStatsByYear', 'trainingResultsByYear',
        'transferDestinationsByYear',
        'bowlEligibilityDataByTeamYear', 'coachingStaffByTeamYear', 'conferenceByTeamYear',
        'conferenceChampionshipDataByTeamYear', 'draftResultsByTeamYear', 'encourageTransfersByTeamYear',
        'fringeCaseClassByTeamYear', 'playersLeavingByTeamYear', 'portalTransferClassByTeamYear',
        'preseasonSetupByTeamYear', 'rankingsByTeamYear', 'recruitingClassRankByTeamYear',
        'recruitingCommitmentsByTeamYear', 'recruitsByTeamYear', 'schedulesByTeamYear',
        'teamRatingsByTeamYear', 'teamRecordsByTeamYear', 'trainingResultsByTeamYear',
        'transferDestinationsByTeamYear',
      ]
      for (const key of subFields) {
        const value = currentDynasty[key]
        if (value === undefined || value === null) continue
        let detail = ''
        if (Array.isArray(value)) detail = ` — ${value.length} records`
        else if (typeof value === 'object') {
          const totalEntries = Object.keys(value).length
          if (totalEntries) detail = ` — ${totalEntries} entries`
        }
        lines.push(`  ${key.padEnd(40)} ${fmt(sizeOf(value)).padStart(10)}${detail}`)
      }
      // Aggregate all seasonal fields under one line — too many to
      // list individually and they all share the same `seasons/{year}`
      // doc.
      let seasonalLoadedTotal = 0
      let seasonalFieldCount = 0
      for (const field of SEASONAL_NAMES) {
        const value = currentDynasty[field]
        if (value && typeof value === 'object' && Object.keys(value).length > 0) {
          seasonalLoadedTotal += sizeOf(value)
          seasonalFieldCount++
        }
      }
      if (seasonalFieldCount > 0) {
        lines.push(`  ${'seasons/* (rehydrated, all fields)'.padEnd(40)} ${fmt(seasonalLoadedTotal).padStart(10)} — ${seasonalFieldCount} fields loaded`)
      }

      // Direct, ground-truth probe of the seasons subcollection — fetch
      // every per-year doc straight from the Firestore server and dump
      // what's actually persisted there. This is the only way to
      // distinguish "migration silently lost data" from "migration
      // worked but rehydration is broken" in the user's open data-loss
      // bug. Server fetch (no cache) so we don't trust the local SDK
      // cache, which can carry stale or partial state.
      lines.push('')
      lines.push('Seasons subcollection — server-fetched contents per year:')
      let serverSeasonsFetchFailed = false
      try {
        const seasonsRef = collection(db, 'dynasties', currentDynasty.id, 'seasons')
        const snap = await getDocsFromServer(seasonsRef)
        if (snap.empty) {
          lines.push('  (subcollection is empty — no seasons docs on server)')
        } else {
          // Sort by year so the oldest seasons render first.
          const yearDocs = snap.docs
            .map(d => ({ id: d.id, data: d.data() || {} }))
            .sort((a, b) => Number(a.id) - Number(b.id))
          for (const { id, data } of yearDocs) {
            const fieldNames = Object.keys(data).filter(k => k !== 'year').sort()
            const docBytes = sizeOf(data)
            // Per-field size + entry count is what tells us whether
            // cfpSeeds is actually populated for that year. Show entry
            // counts inline (length for arrays, key count for objects).
            const fieldSummaries = fieldNames.map(f => {
              const v = data[f]
              let count = ''
              if (Array.isArray(v)) count = `len=${v.length}`
              else if (v && typeof v === 'object') count = `keys=${Object.keys(v).length}`
              else count = `(${typeof v})`
              return `${f}:${count}`
            })
            lines.push(`  ${('seasons/' + id).padEnd(20)} ${fmt(docBytes).padStart(10)}   ${fieldSummaries.join(' ')}`)
          }
        }
      } catch (err) {
        serverSeasonsFetchFailed = true
        lines.push(`  ⚠️ failed: ${err?.code || err?.message || 'unknown'}`)
      }

      lines.push('')
      lines.push(`Run timestamp: ${new Date().toISOString()}`)
      lines.push(`Dynasty: ${currentDynasty.name || currentDynasty.id}`)
      lines.push(`Source: ${serverFetchFailed ? 'in-memory fallback ⚠️' : 'Firestore server (live)'}`)

      const detailText = lines.join('\n')
      console.log('[StorageAnalysis]\n' + detailText)
      setStorageAnalysisDetail(detailText)
      const summary = serverFetchFailed
        ? `⚠️ in-memory fallback. Main doc: ${fmt(mainDocTotal)}. See console.`
        : `Main doc: ${fmt(mainDocTotal)} (${(mainDocTotal / (1024 * 1024) * 100).toFixed(0)}% of cap). Top: ${entries[0]?.key || '—'}.`
      setStorageAnalysisStatus({ success: true, message: summary })
    } catch (error) {
      console.error('[StorageAnalysis] failed:', error)
      setStorageAnalysisStatus({ success: false, message: 'Failed: ' + (error?.message || 'unknown') })
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

  // Fix class data for all players - auto-populate entryYear, entryClass, and classByYear
  const handleFixClassData = async () => {
    setClassDataFixStatus('running')
    try {
      const players = currentDynasty.players || []
      const currentYear = currentDynasty.currentYear || new Date().getFullYear()
      let fixedCount = 0
      let alreadyGoodCount = 0
      let errorCount = 0

      const CLASS_PROGRESSION = {
        'Fr': 'So', 'RS Fr': 'RS So', 'So': 'Jr', 'RS So': 'RS Jr',
        'Jr': 'Sr', 'RS Jr': 'RS Sr', 'Sr': 'RS Sr', 'RS Sr': 'RS Sr'
      }
      const CLASS_ORDER = ['Fr', 'So', 'Jr', 'Sr']
      const RS_CLASS_ORDER = ['RS Fr', 'RS So', 'RS Jr', 'RS Sr']

      const updatedPlayers = players.map(player => {
        try {
          // Skip honor-only players
          if (player.isHonorOnly) return player

          // Determine if player already has good class data
          const hasEntryYear = player.entryYear !== null && player.entryYear !== undefined
          const hasEntryClass = player.entryClass && player.entryClass.trim() !== ''
          const hasClassByYear = player.classByYear && Object.keys(player.classByYear).length > 0

          if (hasEntryYear && hasEntryClass && hasClassByYear) {
            alreadyGoodCount++
            return player
          }

          // Try to infer entryYear from various sources
          let inferredEntryYear = player.entryYear
          if (!inferredEntryYear) {
            // From recruitYear (entry is recruitYear + 1)
            if (player.recruitYear) {
              inferredEntryYear = Number(player.recruitYear) + 1
            }
            // From first year in teamsByYear
            else if (player.teamsByYear && Object.keys(player.teamsByYear).length > 0) {
              const years = Object.keys(player.teamsByYear).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b)
              if (years.length > 0) inferredEntryYear = years[0]
            }
            // From first stint in teamHistory
            else if (player.teamHistory && player.teamHistory.length > 0) {
              const firstStint = player.teamHistory.sort((a, b) => (a.fromYear || 0) - (b.fromYear || 0))[0]
              if (firstStint.fromYear) inferredEntryYear = firstStint.fromYear
            }
            // From classByYear (earliest year)
            else if (player.classByYear && Object.keys(player.classByYear).length > 0) {
              const years = Object.keys(player.classByYear).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b)
              if (years.length > 0) inferredEntryYear = years[0]
            }
          }

          // Try to infer entryClass
          let inferredEntryClass = player.entryClass
          if (!inferredEntryClass && inferredEntryYear) {
            // From classByYear for entry year
            if (player.classByYear?.[inferredEntryYear] || player.classByYear?.[String(inferredEntryYear)]) {
              inferredEntryClass = player.classByYear[inferredEntryYear] || player.classByYear[String(inferredEntryYear)]
            }
            // If portal/transfer, infer from current class and years elapsed
            else if ((player.isPortal || player.previousTeam) && player.year) {
              // Portal players - use their current class at entry
              inferredEntryClass = player.year
            }
            // For recruits, assume Fr
            else {
              inferredEntryClass = 'Fr'
            }
          }

          // Build classByYear based on entry info
          const newClassByYear = { ...(player.classByYear || {}) }
          if (inferredEntryYear && inferredEntryClass) {
            const isRS = inferredEntryClass.startsWith('RS ')
            const baseClass = isRS ? inferredEntryClass.replace('RS ', '') : inferredEntryClass
            const order = isRS ? RS_CLASS_ORDER : CLASS_ORDER

            let baseIndex = CLASS_ORDER.indexOf(baseClass)
            if (baseIndex === -1) baseIndex = 0

            // Get all years this player has been active
            const activeYears = new Set()
            if (player.teamsByYear) {
              Object.keys(player.teamsByYear).forEach(y => activeYears.add(Number(y)))
            }
            if (player.teamHistory) {
              player.teamHistory.forEach(stint => {
                const from = stint.fromYear || inferredEntryYear
                const to = stint.toYear || currentYear
                for (let y = from; y <= to; y++) activeYears.add(y)
              })
            }
            // Ensure entry year is included
            activeYears.add(inferredEntryYear)
            // Add current year if they're on roster
            if (!player.isRecruit) activeYears.add(currentYear)

            // Fill in classes for each year
            Array.from(activeYears).sort((a, b) => a - b).forEach(year => {
              if (newClassByYear[year] || newClassByYear[String(year)]) return // Don't overwrite existing

              const yearsSinceEntry = year - inferredEntryYear
              if (yearsSinceEntry < 0) return

              // Check for redshirt year
              const redshirtYear = player.redshirtYear ? Number(player.redshirtYear) : null
              let useRS = isRS
              if (redshirtYear && year > redshirtYear && !isRS) {
                useRS = true
              }

              const effectiveOrder = useRS ? RS_CLASS_ORDER : CLASS_ORDER
              let classIndex = baseIndex + yearsSinceEntry
              if (redshirtYear && year > redshirtYear && !isRS) {
                classIndex = baseIndex + yearsSinceEntry - 1
              }

              if (classIndex >= 0 && classIndex < effectiveOrder.length) {
                newClassByYear[year] = effectiveOrder[classIndex]
              }
            })
          }

          // Only update if we actually changed something
          const hasChanges =
            inferredEntryYear !== player.entryYear ||
            inferredEntryClass !== player.entryClass ||
            Object.keys(newClassByYear).length !== Object.keys(player.classByYear || {}).length

          if (hasChanges) {
            fixedCount++
            return {
              ...player,
              entryYear: inferredEntryYear || player.entryYear,
              entryClass: inferredEntryClass || player.entryClass,
              classByYear: newClassByYear
            }
          }

          alreadyGoodCount++
          return player
        } catch (err) {
          console.error(`[FixClassData] Error processing player ${player.name}:`, err)
          errorCount++
          return player
        }
      })

      await updateDynasty(currentDynasty.id, { players: updatedPlayers })
      setClassDataFixStatus({
        success: true,
        message: `Fixed ${fixedCount} players, ${alreadyGoodCount} already good${errorCount > 0 ? `, ${errorCount} errors` : ''}`
      })
    } catch (error) {
      setClassDataFixStatus({ success: false, message: 'Fix failed: ' + error.message })
    }
  }


  // Get players on user's team for the advance modal
  // Uses isPlayerOnRoster() to match the same filtering as the Roster page
  const getPlayersOnUserTeam = () => {
    const players = currentDynasty?.players || []
    const currentYear = currentDynasty?.currentYear || new Date().getFullYear()
    const previousYear = currentYear - 1
    const userTid = currentDynasty?.currentTid

    return players.filter(player => {
      // Use the same roster filter as getCurrentRoster() for consistency
      return isPlayerOnRoster(player, userTid, currentYear, currentDynasty)
    }).map(player => {
      const prevYearStats = player.statsByYear?.[previousYear] || player.statsByYear?.[String(previousYear)]
      const gamesPlayed = prevYearStats?.gamesPlayed
      return {
        ...player,
        gamesPlayedLastYear: gamesPlayed,
        isRedshirtCandidate: gamesPlayed !== null && gamesPlayed !== undefined && gamesPlayed <= 4 && !player.year?.startsWith('RS ')
      }
    }).sort((a, b) => {
      // Sort by position, then by name
      const posOrder = ['QB', 'HB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT', 'LEDG', 'REDG', 'DT', 'SAM', 'MIKE', 'WILL', 'CB', 'FS', 'SS', 'K', 'P']
      const posA = posOrder.indexOf(a.position) === -1 ? 99 : posOrder.indexOf(a.position)
      const posB = posOrder.indexOf(b.position) === -1 ? 99 : posOrder.indexOf(b.position)
      if (posA !== posB) return posA - posB
      return (a.name || '').localeCompare(b.name || '')
    })
  }

  // Open advance modal and pre-select all players
  const handleOpenAdvanceModal = () => {
    const teamPlayers = getPlayersOnUserTeam()
    const initialSelections = {}
    teamPlayers.forEach(p => {
      initialSelections[p.pid] = true // Pre-select all
    })
    setAdvanceSelections(initialSelections)
    setShowAdvanceModal(true)
  }

  // Toggle selection for a player
  const toggleAdvanceSelection = (pid) => {
    setAdvanceSelections(prev => ({
      ...prev,
      [pid]: !prev[pid]
    }))
  }

  // Select/deselect all
  const selectAllAdvance = (selected) => {
    const teamPlayers = getPlayersOnUserTeam()
    const newSelections = {}
    teamPlayers.forEach(p => {
      newSelections[p.pid] = selected
    })
    setAdvanceSelections(newSelections)
  }

  // Execute the advance for selected players
  const handleConfirmAdvance = async () => {
    setAdvanceClassesStatus('running')
    setShowAdvanceModal(false)
    try {
      const players = currentDynasty.players || []
      const currentYear = currentDynasty.currentYear || new Date().getFullYear()
      const previousYear = currentYear - 1

      const CLASS_PROGRESSION = {
        'Fr': 'So', 'RS Fr': 'RS So', 'So': 'Jr', 'RS So': 'RS Jr',
        'Jr': 'Sr', 'RS Jr': 'RS Sr', 'Sr': 'RS Sr', 'RS Sr': 'RS Sr'
      }

      let advancedCount = 0
      let redshirtedCount = 0

      const updatedPlayers = players.map(player => {
        // Only process selected players
        if (!advanceSelections[player.pid]) {
          return player
        }

        const currentClass = player.year
        if (!currentClass) return player

        const isAlreadyRS = currentClass.startsWith('RS ')
        const prevYearStats = player.statsByYear?.[previousYear] || player.statsByYear?.[String(previousYear)]
        const gamesPlayed = prevYearStats?.gamesPlayed

        let newClass = currentClass
        if (gamesPlayed !== null && gamesPlayed !== undefined && gamesPlayed <= 4 && !isAlreadyRS) {
          // Redshirt
          newClass = 'RS ' + currentClass
          redshirtedCount++
        } else {
          // Normal progression
          newClass = CLASS_PROGRESSION[currentClass] || currentClass
        }

        if (newClass === currentClass) return player

        advancedCount++
        return {
          ...player,
          year: newClass,
          classByYear: {
            ...(player.classByYear || {}),
            [currentYear]: newClass
          }
        }
      })

      await updateDynasty(currentDynasty.id, { players: updatedPlayers })
      setAdvanceClassesStatus({
        success: true,
        message: `Advanced ${advancedCount} players (${redshirtedCount} redshirted)`
      })
    } catch (error) {
      setAdvanceClassesStatus({ success: false, message: 'Advance failed: ' + error.message })
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
          t1 = getTidFromAbbr(game.userTeam, currentDynasty) || 0
        }
        if (!t1 && game.team1) {
          t1 = getTidFromAbbr(game.team1, currentDynasty) || 0
        }

        // Get team 2 tid - check tid fields first, then convert from abbreviation
        let t2 = game.team2Tid || game.opponentTid || 0
        if (!t2 && game.opponent) {
          t2 = getTidFromAbbr(game.opponent, currentDynasty) || 0
        }
        if (!t2 && game.team2) {
          t2 = getTidFromAbbr(game.team2, currentDynasty) || 0
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

  // Fix schedule links - ensures all schedule entries point to correct games
  const handleFixScheduleLinks = async () => {
    setScheduleLinkFixStatus('running')
    try {
      const games = currentDynasty.games || []
      const teams = currentDynasty.teams || {}
      let fixedCount = 0
      let gameTypeFixedCount = 0

      // First, fix gameType on all regular season games that are missing it
      const updatedGames = games.map(game => {
        if (!game.gameType && !game.isConferenceChampionship && !game.isBowlGame &&
            !game.isCFPFirstRound && !game.isCFPQuarterfinal &&
            !game.isCFPSemifinal && !game.isCFPChampionship) {
          gameTypeFixedCount++
          return { ...game, gameType: 'regular' }
        }
        return game
      })

      // Update each team's schedule entries
      const updatedTeams = { ...teams }
      Object.keys(updatedTeams).forEach(tidKey => {
        const tid = Number(tidKey)
        const team = updatedTeams[tid]
        if (!team.byYear) return

        Object.keys(team.byYear).forEach(yearKey => {
          const year = Number(yearKey)
          const yearData = team.byYear[year]
          if (!yearData.schedule || yearData.schedule.length === 0) return

          const updatedSchedule = yearData.schedule.map(entry => {
            // Skip bye weeks
            if (entry.isBye || !entry.opponent) return entry

            // If already has a valid gameId, keep it
            if (entry.gameId && updatedGames.find(g => g.id === entry.gameId)) {
              return entry
            }

            // Find matching game by week/year/teams
            const opponentTid = getTidFromAbbr(entry.opponent, currentDynasty)
            const matchingGame = updatedGames.find(g =>
              Number(g.week) === Number(entry.week) &&
              Number(g.year) === Number(year) &&
              (g.gameType === 'regular' || !g.gameType) &&
              ((g.team1Tid === tid && g.team2Tid === opponentTid) ||
               (g.team2Tid === tid && g.team1Tid === opponentTid))
            )

            if (matchingGame && matchingGame.id !== entry.gameId) {
              fixedCount++
              return { ...entry, gameId: matchingGame.id }
            }

            return entry
          })

          updatedTeams[tid].byYear[year].schedule = updatedSchedule
        })
      })

      // Save updates
      await updateDynasty(currentDynasty.id, {
        games: updatedGames,
        teams: updatedTeams
      })

      const message = `Fixed ${fixedCount} schedule link(s)${gameTypeFixedCount > 0 ? ` and ${gameTypeFixedCount} game type(s)` : ''}`
      setScheduleLinkFixStatus({ success: true, message })
    } catch (error) {
      setScheduleLinkFixStatus({ success: false, message: 'Fix failed: ' + error.message })
    }
  }

  // Delete a specific game by ID
  const handleDeleteGame = async (gameId) => {
    if (!gameId) return
    const ok = await confirm({
      title: 'Delete this game?',
      message: 'This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return

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
        const tid = playerTeam ? getTidFromAbbr(playerTeam, currentDynasty) : null

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

      // Helper: Create a new player for an honor. Honor-imported players
      // are regular roster records — `isHonorOnly: false` is explicit so
      // the legacy `!p.isHonorOnly` filters scattered around the codebase
      // keep them visible in every list view.
      const createPlayerForHonor = (name, position, team, honorType, honor, year) => {
        const tid = team ? getTidFromAbbr(team, currentDynasty) : null
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
          movements: [],
          isHonorOnly: false,
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

        // Find matching player. Pass dynasty.teams so teambuilder-renamed
        // slots resolve correctly (else a TB takeover would mis-classify the
        // same person as a transfer to a "different" team).
        const match = findMatchingPlayer(playerName, playerTeam, year, existingPlayers, currentDynasty?.teams)

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
          const tid = getTidFromAbbr(seed.team, currentDynasty)
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
          const tid = getTidFromAbbr(updatedGame.team1, currentDynasty)
          if (tid) {
            updatedGame.team1Tid = tid
            gameModified = true
          }
        }

        // Add team2Tid if missing but team2 exists
        if (!updatedGame.team2Tid && updatedGame.team2) {
          const tid = getTidFromAbbr(updatedGame.team2, currentDynasty)
          if (tid) {
            updatedGame.team2Tid = tid
            gameModified = true
          }
        }

        // Add winnerTid if missing but winner exists
        if (!updatedGame.winnerTid && updatedGame.winner) {
          const tid = getTidFromAbbr(updatedGame.winner, currentDynasty)
          if (tid) {
            updatedGame.winnerTid = tid
            gameModified = true
          }
        }

        // Also try to compute winner from scores if not set
        if (!updatedGame.winner && updatedGame.team1Score !== null && updatedGame.team2Score !== null) {
          updatedGame.winner = updatedGame.team1Score > updatedGame.team2Score ? updatedGame.team1 : updatedGame.team2
          if (updatedGame.winner) {
            updatedGame.winnerTid = getTidFromAbbr(updatedGame.winner, currentDynasty)
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

  // Remove the isConferenceChampionship flag from games that match a
  // known non-CCG rivalry pair (currently just Army-Navy — the
  // Week 14 weekly-scores importer used to auto-promote it to the
  // "American Championship" before the Week-15-only fix).
  //
  // An earlier version of this tool also stripped the flag from any
  // CCG without an exact Week 15 marker — that was a bug, because
  // legitimate CCGs saved through the dedicated CC flow don't have
  // game.week set at all (it's undefined → NaN !== 15 → stripped).
  // The "wrong week" criterion is gone; only the rivalry-pair list
  // drives unflagging now. If something else is mis-flagged, add
  // its pair to NON_CCG_RIVALRY_PAIRS rather than re-introducing a
  // heuristic that catches too much.
  const NON_CCG_RIVALRY_PAIRS = new Set(['ARMY|NAVY'])

  const resolveGameAbbr = (game, side) => {
    const direct = side === 1 ? game.team1 : game.team2
    if (direct) return direct
    const tid = side === 1 ? game.team1Tid : game.team2Tid
    if (tid != null) {
      const team = currentDynasty?.teams?.[tid] || TEAMS[tid]
      return team?.abbr || getOriginalTeamAbbr(tid)
    }
    return side === 1 ? game.userTeam : game.opponent
  }

  const handleUnflagWrongCCG = async () => {
    try {
      const games = currentDynasty.games || []
      let checkedCount = 0

      // FIRST: identify what we'd change, WITHOUT modifying anything.
      // Then show the user a confirm dialog with the list. Two prior
      // versions of this tool over-matched and silently wiped every CCG
      // in the dynasty — a preview-and-confirm step makes that
      // impossible to repeat regardless of any future logic bug.
      const candidates = []
      for (const game of games) {
        const isFlaggedCCG = game.isConferenceChampionship
          || game.gameType === 'conference_championship'
        if (!isFlaggedCCG) continue
        checkedCount++

        const a = (resolveGameAbbr(game, 1) || '').toUpperCase()
        const b = (resolveGameAbbr(game, 2) || '').toUpperCase()
        const pair = a && b ? [a, b].sort().join('|') : null
        const isKnownNonCCG = pair && NON_CCG_RIVALRY_PAIRS.has(pair)
        if (!isKnownNonCCG) continue

        candidates.push({ id: game.id, year: game.year, a, b, conference: game.conference })
      }

      if (candidates.length === 0) {
        setCcgMisflagStatus({ success: true, message: checkedCount === 0
          ? 'No conference-championship games to check.'
          : `All ${checkedCount} CCG games look legitimate — nothing to unflag.`
        })
        return
      }

      // Preview dialog. List every game we'd touch so the user can
      // verify before anything is written. Bail out if they say no.
      const previewLines = candidates.slice(0, 20).map(c =>
        `  • ${c.year || '?'} ${c.a} vs ${c.b}${c.conference ? ` (${c.conference})` : ''}`
      ).join('\n')
      const overflow = candidates.length > 20 ? `\n  …and ${candidates.length - 20} more` : ''
      const ok = await confirm({
        title: `Unflag ${candidates.length} game${candidates.length === 1 ? '' : 's'}?`,
        message: `Will remove the conference-championship flag from:\n\n${previewLines}${overflow}\n\nMatches the known non-CCG rivalry list (currently only Army-Navy). Continue?`,
        confirmLabel: 'Unflag',
        variant: 'danger',
      })
      if (!ok) return

      setCcgMisflagStatus('running')

      // Now actually apply the changes.
      const candidateIds = new Set(candidates.map(c => c.id))
      let fixedCount = 0
      const updatedGames = games.map(game => {
        if (!candidateIds.has(game.id)) return game
        const { isConferenceChampionship: _ccg, ...rest } = game
        fixedCount++
        return { ...rest, gameType: GAME_TYPES.REGULAR }
      })

      const changedGames = updatedGames.filter((g, i) => g !== games[i])
      if (currentDynasty.storageType === 'cloud') {
        try {
          await saveWeeklyGamesChanges(currentDynasty.id, changedGames, [])
          await updateDynasty(currentDynasty.id, { games: updatedGames }, { skipGamesSubcollection: true })
          setCcgMisflagStatus({ success: true, message: `Unflagged ${fixedCount} mis-classified game(s).` })
          return
        } catch (err) {
          console.error('[CCG Mis-flag] Fast-path failed, falling back:', err)
        }
      }
      await updateDynasty(currentDynasty.id, { games: updatedGames })
      setCcgMisflagStatus({ success: true, message: `Unflagged ${fixedCount} mis-classified game(s).` })
    } catch (error) {
      console.error('[CCG Mis-flag] Error:', error)
      setCcgMisflagStatus({ success: false, message: 'Repair failed: ' + error.message })
    }
  }

  // Re-flag CCG games that lost their flag. The broken first version
  // of handleUnflagWrongCCG (shipped briefly in 32fdebc) stripped the
  // championship flag from any CCG without game.week === 15 — which
  // hit every legitimate CCG saved through the dedicated CC flow
  // (those don't carry a week field at all).
  //
  // Heuristic for "this game LOOKS like a CCG that lost its flag":
  //   - `conference` field is set (a non-empty string). This is the
  //     critical breadcrumb — the strip removed isConferenceChampionship
  //     and downgraded gameType to 'regular', but `conference` was
  //     preserved. CCG saves consistently set this; regular conference
  //     games do not.
  //   - Currently NOT flagged as CCG.
  //   - Not in the known non-CCG rivalry list (so we don't re-flag
  //     Army-Navy if the unflag tool just ran).
  //
  // For each match, re-set isConferenceChampionship + gameType. If a
  // legitimate regular game happens to have a `conference` field, the
  // user can run "Unflag Wrong CCGs" after with that pair added to
  // NON_CCG_RIVALRY_PAIRS — but in practice the field is CCG-only.
  const handleRestoreCCGFlags = async () => {
    try {
      const games = currentDynasty.games || []
      const candidates = []

      for (const game of games) {
        const isFlaggedCCG = game.isConferenceChampionship
          || game.gameType === 'conference_championship'
        if (isFlaggedCCG) continue

        // Conference-field breadcrumb. Required: must be a non-empty
        // string. Regular conference games typically don't have this
        // field — it's set when saving through the CC flow OR by the
        // weekly-scores auto-promote.
        if (!game.conference || typeof game.conference !== 'string') continue

        const a = (resolveGameAbbr(game, 1) || '').toUpperCase()
        const b = (resolveGameAbbr(game, 2) || '').toUpperCase()
        const pair = a && b ? [a, b].sort().join('|') : null
        if (pair && NON_CCG_RIVALRY_PAIRS.has(pair)) continue

        candidates.push({ id: game.id, year: game.year, a, b, conference: game.conference })
      }

      if (candidates.length === 0) {
        setCcgRestoreStatus({ success: true, message: 'Nothing to restore — no candidate games found.' })
        return
      }

      // Preview-and-confirm before writing anything.
      const previewLines = candidates.slice(0, 20).map(c =>
        `  • ${c.year || '?'} ${c.a} vs ${c.b}${c.conference ? ` (${c.conference} Championship)` : ''}`
      ).join('\n')
      const overflow = candidates.length > 20 ? `\n  …and ${candidates.length - 20} more` : ''
      const ok = await confirm({
        title: `Restore CCG flag on ${candidates.length} game${candidates.length === 1 ? '' : 's'}?`,
        message: `Will re-flag these games as their conference championship:\n\n${previewLines}${overflow}\n\nUses the conference-field breadcrumb left from past CCG saves. Continue?`,
        confirmLabel: 'Restore',
        variant: 'default',
      })
      if (!ok) return

      setCcgRestoreStatus('running')

      const candidateIds = new Set(candidates.map(c => c.id))
      let restoredCount = 0
      const updatedGames = games.map(game => {
        if (!candidateIds.has(game.id)) return game
        restoredCount++
        return {
          ...game,
          isConferenceChampionship: true,
          gameType: GAME_TYPES.CONFERENCE_CHAMPIONSHIP,
        }
      })

      const changedGames = updatedGames.filter((g, i) => g !== games[i])
      if (currentDynasty.storageType === 'cloud') {
        try {
          await saveWeeklyGamesChanges(currentDynasty.id, changedGames, [])
          await updateDynasty(currentDynasty.id, { games: updatedGames }, { skipGamesSubcollection: true })
          setCcgRestoreStatus({ success: true, message: `Restored CCG flag on ${restoredCount} game(s).` })
          return
        } catch (err) {
          console.error('[CCG Restore] Fast-path failed:', err)
        }
      }
      await updateDynasty(currentDynasty.id, { games: updatedGames })
      setCcgRestoreStatus({ success: true, message: `Restored CCG flag on ${restoredCount} game(s).` })
    } catch (error) {
      console.error('[CCG Restore] Error:', error)
      setCcgRestoreStatus({ success: false, message: 'Restore failed: ' + error.message })
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

  const [rankByWeekStatus, setRankByWeekStatus] = useState(null)
  const handleRankByWeekMigration = async () => {
    setRankByWeekStatus('running')
    try {
      // SAFE rebuild: reads each game's CURRENT team1Rank / team2Rank
      // (which after migration IS the entering rank — no shift) and
      // rewrites rankByWeek straight from those values. Re-applies
      // preseason poll seeds at week 0/1 and final-poll seeds at
      // week 105. Idempotent — running it any number of times
      // produces the same result.
      //
      // (We deliberately DO NOT force-re-run migrateRanksToRankByWeek
      // here. That migration assumes raw post-game-rank data; on a
      // dynasty that's already been migrated, re-running would
      // shift already-shifted entering ranks by another +1 and
      // corrupt the data.)
      const newTeams = rebuildRankByWeekFromCurrentState(currentDynasty)
      await updateDynasty(currentDynasty.id, { teams: newTeams })
      setRankByWeekStatus({ success: true, message: 'Per-team-per-week ranks rebuilt from current game records.' })
    } catch (error) {
      setRankByWeekStatus({ success: false, message: 'Rebuild failed: ' + error.message })
    }
  }

  const [syncGamesStatus, setSyncGamesStatus] = useState(null)
  const handleSyncGamesFromRankByWeek = async () => {
    setSyncGamesStatus('running')
    try {
      // Heal divergent game.team1Rank/team2Rank values by overwriting
      // them with whatever rankByWeek[year][week] currently holds for
      // each team. Use this when a Top 25 sheet edit corrected the
      // poll picture but the per-game stored ranks still reflect the
      // old values — Rankings page is right, Game pages are wrong.
      // Walks every (year, week) the dynasty has rankByWeek data for.
      const teams = currentDynasty.teams || {}
      const allYearWeeks = {}
      for (const team of Object.values(teams)) {
        if (!team?.byYear) continue
        for (const [yearKey, yEntry] of Object.entries(team.byYear)) {
          const yr = Number(yearKey)
          if (!Number.isFinite(yr)) continue
          const rbw = yEntry?.rankByWeek
          if (!rbw) continue
          if (!allYearWeeks[yr]) allYearWeeks[yr] = new Set()
          for (const k of Object.keys(rbw)) {
            const wk = Number(k)
            if (Number.isFinite(wk)) allYearWeeks[yr].add(wk)
          }
        }
      }
      const newGames = syncGameRanksFromRankByWeek(currentDynasty.games || [], teams, allYearWeeks)
      if (newGames === currentDynasty.games) {
        setSyncGamesStatus({ success: true, message: 'No game-rank changes — every stored rank already matches the Top 25 picture.' })
        return
      }
      let changed = 0
      const before = currentDynasty.games || []
      for (let i = 0; i < newGames.length; i++) {
        if (newGames[i] !== before[i]) changed++
      }
      await updateDynasty(currentDynasty.id, { games: newGames })
      setSyncGamesStatus({ success: true, message: `Updated ${changed} game record${changed === 1 ? '' : 's'} to match the current Top 25 picture.` })
    } catch (error) {
      setSyncGamesStatus({ success: false, message: 'Sync failed: ' + error.message })
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

  // Step 1: Detect duplicate players and show confirmation UI
  const handleDetectDuplicates = () => {
    setDuplicateMergeStatus('running')
    try {
      const players = currentDynasty.players || []

      // Group players by normalized name
      const playersByName = new Map()
      players.forEach(p => {
        if (!p.name) return
        const normalizedName = p.name.toLowerCase().trim()
        if (!playersByName.has(normalizedName)) {
          playersByName.set(normalizedName, [])
        }
        playersByName.get(normalizedName).push(p)
      })

      // Find duplicates (names with more than one player)
      const groups = []
      playersByName.forEach((group, name) => {
        if (group.length > 1) {
          // Sort by pid (lowest = oldest = primary)
          const sorted = [...group].sort((a, b) => (a.pid || 999999) - (b.pid || 999999))
          groups.push({ name, players: sorted })
        }
      })

      if (groups.length === 0) {
        setDuplicateMergeStatus({ success: true, message: 'No duplicate players found.' })
        setDuplicateGroups(null)
        return
      }

      // Show confirmation UI with all groups selected by default
      setDuplicateGroups(groups)
      setSelectedMergeGroups(new Set(groups.map((_, idx) => idx)))
      setDuplicateMergeStatus(null)
    } catch (error) {
      console.error('[Duplicate Detect] Error:', error)
      setDuplicateMergeStatus({ success: false, message: 'Detection failed: ' + error.message })
    }
  }

  // Step 2: Merge the selected duplicate groups
  const handleConfirmMerge = async () => {
    if (!duplicateGroups || selectedMergeGroups.size === 0) {
      setDuplicateGroups(null)
      return
    }

    setDuplicateMergeStatus('running')
    try {
      const players = currentDynasty.players || []
      const playersByName = new Map()
      players.forEach(p => {
        if (!p.name) return
        const normalizedName = p.name.toLowerCase().trim()
        if (!playersByName.has(normalizedName)) {
          playersByName.set(normalizedName, [])
        }
        playersByName.get(normalizedName).push(p)
      })

      let mergedCount = 0
      const pidsToRemove = new Set()
      const mergedPlayers = []

      // Only process selected groups
      duplicateGroups.forEach((group, idx) => {
        if (!selectedMergeGroups.has(idx)) return

        console.log(`[Duplicate Merge] Processing: ${group.name} (${group.players.length} entries)`)

        const primary = group.players[0] // Already sorted by pid
        const duplicates = group.players.slice(1)

        // Merge all duplicates into primary
        let merged = { ...primary }

        for (const dup of duplicates) {
          // Merge teamsByYear
          if (dup.teamsByYear) {
            merged.teamsByYear = { ...merged.teamsByYear, ...dup.teamsByYear }
          }
          // Merge statsByYear: deep-merge per year so different categories in the
          // same season (e.g. primary has passing, duplicate has rushing) are
          // both preserved instead of one side winning wholesale.
          if (dup.statsByYear) {
            const mergedStatsByYear = { ...(merged.statsByYear || {}) }
            Object.entries(dup.statsByYear).forEach(([year, dupYearStats]) => {
              const existingYearStats = mergedStatsByYear[year] || {}
              const mergedYearStats = { ...existingYearStats }
              Object.entries(dupYearStats || {}).forEach(([category, dupCatStats]) => {
                if (dupCatStats && typeof dupCatStats === 'object' && !Array.isArray(dupCatStats)) {
                  mergedYearStats[category] = {
                    ...(existingYearStats[category] || {}),
                    ...dupCatStats
                  }
                } else if (mergedYearStats[category] === undefined) {
                  mergedYearStats[category] = dupCatStats
                }
              })
              mergedStatsByYear[year] = mergedYearStats
            })
            merged.statsByYear = mergedStatsByYear
          }
          // Merge classByYear
          if (dup.classByYear) {
            merged.classByYear = { ...merged.classByYear, ...dup.classByYear }
          }
          // Merge overallByYear
          if (dup.overallByYear) {
            merged.overallByYear = { ...merged.overallByYear, ...dup.overallByYear }
          }
          // Merge movements — prefer the canonical movementByYear map.
          // Year-by-year merge: dup wins only when merged is empty for
          // that year, so we don't clobber a known-good entry with a
          // legacy stub. syncDerivedFieldsFromV2 strips the legacy
          // movements[] array on save, so writing it here is dead;
          // merging movementByYear is the actual single-source-of-truth.
          if (dup.movementByYear && typeof dup.movementByYear === 'object') {
            const mergedByYear = { ...(merged.movementByYear || {}) }
            for (const [yr, mv] of Object.entries(dup.movementByYear)) {
              if (mv && !mergedByYear[yr] && !mergedByYear[String(yr)]) {
                mergedByYear[yr] = mv
              }
            }
            merged.movementByYear = mergedByYear
          }
          // Keep highest overall rating
          if (dup.overall && (!merged.overall || dup.overall > merged.overall)) {
            merged.overall = dup.overall
          }
          // Merge honors
          if (dup.honors) {
            const existingHonors = merged.honors || []
            const existingHonorKeys = new Set(existingHonors.map(h => `${h.year}-${h.honorType}`))
            const newHonors = dup.honors.filter(h => !existingHonorKeys.has(`${h.year}-${h.honorType}`))
            merged.honors = [...existingHonors, ...newHonors]
          }
          // Keep any recruiting info that might be missing
          if (!merged.stars && dup.stars) merged.stars = dup.stars
          if (!merged.nationalRank && dup.nationalRank) merged.nationalRank = dup.nationalRank
          if (!merged.stateRank && dup.stateRank) merged.stateRank = dup.stateRank
          if (!merged.positionRank && dup.positionRank) merged.positionRank = dup.positionRank
          if (!merged.previousTeam && dup.previousTeam) merged.previousTeam = dup.previousTeam
          if (!merged.devTrait && dup.devTrait) merged.devTrait = dup.devTrait
          if (!merged.archetype && dup.archetype) merged.archetype = dup.archetype
          if (!merged.height && dup.height) merged.height = dup.height
          if (!merged.weight && dup.weight) merged.weight = dup.weight

          pidsToRemove.add(dup.pid)
        }

        // Sort movements by year
        if (merged.movements) {
          merged.movements.sort((a, b) => (a.year || 0) - (b.year || 0))
        }

        mergedPlayers.push(merged)
        mergedCount++
      })

      // Build final players array
      const nonDuplicatePlayers = players.filter(p => !pidsToRemove.has(p.pid))
      const finalPlayers = nonDuplicatePlayers.map(p => {
        const merged = mergedPlayers.find(m => m.pid === p.pid)
        return merged || p
      })

      console.log(`[Duplicate Merge] Final: ${finalPlayers.length} players (removed ${pidsToRemove.size} duplicates)`)

      await updateDynasty(currentDynasty.id, { players: finalPlayers })

      setDuplicateMergeStatus({
        success: true,
        message: `Merged ${mergedCount} duplicate player groups (removed ${pidsToRemove.size} duplicate entries).`
      })
      setDuplicateGroups(null)
      setSelectedMergeGroups(new Set())
    } catch (error) {
      console.error('[Duplicate Merge] Error:', error)
      setDuplicateMergeStatus({ success: false, message: 'Merge failed: ' + error.message })
    }
  }

  // Cancel merge and close confirmation UI
  const handleCancelMerge = () => {
    setDuplicateGroups(null)
    setSelectedMergeGroups(new Set())
    setDuplicateMergeStatus(null)
  }

  // Toggle a group's selection
  const toggleGroupSelection = (idx) => {
    setSelectedMergeGroups(prev => {
      const next = new Set(prev)
      if (next.has(idx)) {
        next.delete(idx)
      } else {
        next.add(idx)
      }
      return next
    })
  }

  // Helper to get team abbreviation from tid
  const getTeamAbbrFromTid = (tid) => {
    if (typeof tid === 'string') return tid
    // Dynasty teams FIRST so teambuilder-renamed teams win over stale
    // static data.
    const team = currentDynasty?.teams?.[tid] || currentDynasty?.customTeams?.[tid] || TEAMS[tid]
    return team?.abbr || `Team ${tid}`
  }

  // ==========================================================
  // V2 CONSOLIDATION — ONE-CLICK FULL CLEANUP
  // ==========================================================
  //
  // Runs the v2 migration (consolidates movements[] → movementByYear,
  // drops ghost records, trims stale teamsByYear entries past departure)
  // AND rewrites every player through syncDerivedFieldsFromV2 so the
  // top-level player.year / .team / .overall / .devTrait fields are a
  // consistent mirror of the canonical per-year maps. Persists with
  // forceOverwrite so legacy keys actually get stripped from Firestore.
  // Stamps _schemaVersion: 2 on the dynasty.
  //
  // Safe to re-run. No-op on a dynasty that's already v2-clean.
  //
  const handleFixPreseasonRecap = async () => {
    const recaps = currentDynasty?.weekRecapsByYear || {}
    const yearsWithWeek0 = Object.keys(recaps).filter(y => recaps[y]?.[0]?.text)
    if (yearsWithWeek0.length === 0) {
      setPreseasonRecapFixStatus('done — no week-0 preseason recaps found')
      return
    }
    const ok = await confirm({
      title: 'Fix preseason recap location?',
      message: `Found preseason recap data stored at week 0 in ${yearsWithWeek0.length} season(s). This will move each to week -1 (if empty there) or delete it (if week -1 already has a recap). This frees week 0 for actual Week 0 game recaps.`,
      confirmLabel: 'Fix',
      variant: 'primary',
    })
    if (!ok) return

    setPreseasonRecapFixStatus('running')
    try {
      let moved = 0, deleted = 0
      for (const y of yearsWithWeek0) {
        const year = Number(y)
        const week0recap = recaps[y][0]
        const week_1recap = recaps[y]?.[-1] || recaps[y]?.[-1]
        if (!week_1recap?.text) {
          await saveWeekRecap(currentDynasty.id, year, -1, week0recap)
          moved++
        } else {
          deleted++
        }
        await deleteWeekRecap(currentDynasty.id, year, 0)
      }
      setPreseasonRecapFixStatus(`done — ${moved} moved, ${deleted} cleared`)
    } catch (e) {
      setPreseasonRecapFixStatus(`error: ${e.message}`)
    }
  }

  const handleV2Consolidate = async () => {
    const ok = await confirm({
      title: 'Consolidate all players to v2?',
      message: 'Rewrites every player using the canonical v2 schema and strips legacy fields. Recommended for existing dynasties to prevent roster drift bugs. Safe to re-run.',
      confirmLabel: 'Consolidate',
      variant: 'primary',
    })
    if (!ok) return

    setV2ConsolidateStatus('running')
    try {
      const { dynasty: migrated, report } = migrateDynastyToV2(currentDynasty)
      const currentYear = migrated.currentYear

      // Pass 2: every surviving player through syncDerivedFieldsFromV2
      // to normalize derived top-level fields and strip deprecated keys.
      const normalizedPlayers = (migrated.players || []).map(p =>
        syncDerivedFieldsFromV2(p, currentYear)
      )

      await updateDynasty(
        currentDynasty.id,
        {
          _schemaVersion: 2,
          _normalizedAt: migrated._normalizedAt || new Date().toISOString(),
          players: normalizedPlayers,
        },
        { forceOverwrite: true }
      )

      setV2ConsolidateStatus({
        success: true,
        message:
          `Consolidated ${normalizedPlayers.length} players to v2. ` +
          `Dropped ${report.playersDropped.length} ghost/placeholder records, ` +
          `resolved ${report.collisionsResolved} movement collisions, ` +
          `trimmed ${report.staleTeamsByYearTrimmed} stale post-departure entries.`,
      })
    } catch (error) {
      console.error('[v2 consolidate] failed:', error)
      setV2ConsolidateStatus({ success: false, message: 'Consolidate failed: ' + error.message })
    }
  }

  // Status line (success/error/running)
  const StatusLine = ({ status }) => {
    if (!status || status === 'running') return null
    const color = status.success ? 'var(--accent-success)' : 'var(--accent-error)'
    return (
      <p className="label-xs mt-2 m-0" style={{ color }}>
        {status.message}
      </p>
    )
  }

  // Compact Action Card
  // ActionCard accepts a `danger` flag for actions that have known
  // failure modes on legacy dynasties (CFP repair has miswired user
  // brackets, class fixers can clobber canonical classByYear maps).
  // Danger cards get:
  //   - a left rail in --accent-error
  //   - a "USE WITH CAUTION" eyebrow above the title
  //   - a confirm dialog that requires the user to acknowledge they
  //     have a backup before the destructive handler runs
  // Safer handlers pass through unchanged.
  const ActionCard = ({ title, description, buttonText, onClick, status, variant = 'primary', danger = false }) => {
    const isRunning = status === 'running'

    const guardedClick = async () => {
      if (!danger) {
        onClick?.()
        return
      }
      const ok = await confirm({
        title: `Run "${title}"?`,
        message: `This action can corrupt records on dynasties that started on older backend versions. ${description} Make sure you've downloaded a backup before continuing.`,
        confirmLabel: 'I have a backup — run it',
        cancelLabel: 'Cancel',
        variant: 'danger',
      })
      if (ok) onClick?.()
    }

    return (
      <Card
        className="flex flex-col h-full"
        style={danger ? { borderLeft: '3px solid var(--accent-error)' } : undefined}
      >
        <div className="mb-3">
          {danger && (
            <div className="label-xs mb-1.5" style={{ color: 'var(--accent-error)', letterSpacing: '1.5px' }}>
              USE WITH CAUTION
            </div>
          )}
          <h3 className="label-sm text-txt-primary m-0">{title}</h3>
          <p className="text-xs mt-1 text-txt-tertiary leading-relaxed m-0">
            {description}
          </p>
        </div>
        <div className="mt-auto">
          <Button
            variant={danger ? 'danger' : variant}
            size="sm"
            onClick={guardedClick}
            disabled={isRunning}
            className="w-full"
          >
            {isRunning ? 'Running...' : buttonText}
          </Button>
          <StatusLine status={status} />
        </div>
      </Card>
    )
  }

  // Find teambuilder teams
  const teams = currentDynasty?.teams || {}
  const teambuilderTeams = Object.values(teams).filter(t => t.isCustom)

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHero
        eyebrow="Admin"
        title="Danger Zone"
        meta={<span>Data repair and maintenance</span>}
        actions={
          <Button variant="outline" size="sm" onClick={() => setShowHelp(!showHelp)}>
            {showHelp ? 'Hide Help' : 'Help'}
          </Button>
        }
      />

      {/* Help Section (Collapsible) */}
      {showHelp && (
        <Card style={{ borderLeft: '3px solid var(--accent-info)' }}>
          <h3 className="label-sm text-txt-primary m-0 mb-2">When to use these tools</h3>
          <div className="grid sm:grid-cols-2 gap-2 text-xs text-txt-secondary">
            <div><strong className="text-txt-primary">Fix Roster:</strong> Departed players still showing on roster</div>
            <div><strong className="text-txt-primary">Sync Recruiting:</strong> Missing data on recruiting pages</div>
            <div><strong className="text-txt-primary">Remove Duplicates:</strong> Wrong win/loss record</div>
            <div><strong className="text-txt-primary">Repair CFP:</strong> CFP games open wrong page or show wrong bowl names</div>
            <div><strong className="text-txt-primary">Repair CCG:</strong> Conference championship games not showing in history</div>
            <div><strong className="text-txt-primary">Merge Players:</strong> Transfer created duplicate player instead of updating</div>
            <div><strong className="text-txt-primary">Clear Cache:</strong> Google Sheets errors or stale data</div>
            <div><strong className="text-txt-primary">Migrate Career:</strong> Gaps in player year-by-year data</div>
            <div><strong className="text-txt-primary">Fix Preseason Recap:</strong> Week 0 showing old preseason recap instead of game recap</div>
          </div>
        </Card>
      )}

      {/* Warning Banner */}
      <Card style={{ borderLeft: '3px solid var(--accent-warning)' }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-txt-secondary m-0">
            <strong style={{ color: 'var(--accent-warning)' }}>Back up first.</strong> Download a backup before making changes.
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={() => exportDynasty && exportDynasty(dynastyId)}
          >
            Download Backup
          </Button>
        </div>
      </Card>

      {/* Common Fixes — safe to run on any dynasty. These walk the
          canonical v2 stores and apply idempotent cleanup. */}
      <div>
        <SectionHeader
          size="sm"
          title="Common Fixes"
          subtitle="Safe to run, idempotent"
        />
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
          <ActionCard
            title="Consolidate to v2"
            description="Recommended first step. Migrates every player to the canonical v2 schema, drops ghost records, resolves movement collisions, trims stale post-departure entries, and strips deprecated legacy fields. Safe to re-run."
            buttonText="Consolidate"
            onClick={handleV2Consolidate}
            status={v2ConsolidateStatus}
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
            title="Fix Schedule Links"
            description="Links schedule entries to game records and fixes missing gameType"
            buttonText="Fix Links"
            onClick={handleFixScheduleLinks}
            status={scheduleLinkFixStatus}
          />
          <ActionCard
            title="Repair CCG Games"
            description="Adds missing conference field to Conference Championship games"
            buttonText="Repair CCG"
            onClick={handleRepairCCGames}
            status={ccgRepairStatus}
          />
          <ActionCard
            title="Unflag Wrong CCG Games"
            description="Removes the conference-championship flag from games matching a known non-CCG rivalry pair (currently just Army-Navy)"
            buttonText="Unflag Wrong CCGs"
            onClick={handleUnflagWrongCCG}
            status={ccgMisflagStatus}
          />
          <ActionCard
            title="Restore CCG Flags"
            description="Re-flags games that look like CCGs but lost the flag (uses the conference-field breadcrumb left by every CCG save). Run this if an earlier version of the Unflag tool stripped your real championships."
            buttonText="Restore CCGs"
            onClick={handleRestoreCCGFlags}
            status={ccgRestoreStatus}
          />
          <ActionCard
            title="Merge Duplicate Players"
            description="Finds players with same name and merges their stats/history"
            buttonText="Merge Players"
            onClick={handleDetectDuplicates}
            status={duplicateMergeStatus}
          />
          <ActionCard
            title="Sync Honors to Players"
            description="Links awards, All-Americans & All-Conference to player records. Normalizes legacy award names back to canonical keys so the editor stays clean."
            buttonText="Sync Honors"
            onClick={handleSyncHonorsToPlayers}
            status={honorsSyncStatus}
          />
          <ActionCard
            title="Fix Preseason Recap Location"
            description="Moves preseason recaps stored at week 0 (old format) to week -1, freeing week 0 for actual Week 0 game recaps."
            buttonText="Fix"
            onClick={handleFixPreseasonRecap}
            status={preseasonRecapFixStatus}
          />
          {/* Storage size diagnostic — surfaces which dynasty fields are
              taking up the most space in the main Firestore doc, since
              that doc is capped at 1 MiB and all writes fail once it's
              over. Output is multi-line so this gets a full custom
              card instead of using ActionCard's single-line StatusLine. */}
          <Card className="flex flex-col h-full sm:col-span-2 md:col-span-2">
            <div className="mb-3">
              <h3 className="label-sm text-txt-primary m-0">Analyze Storage Size</h3>
              <p className="text-xs mt-1 text-txt-tertiary leading-relaxed m-0">
                Reports how many bytes each top-level dynasty field is using on the main Firestore doc (1 MiB cap). Run this if writes are failing with "document too big", or to see which field will be the next migration target.
              </p>
            </div>
            <div className="mt-auto space-y-2">
              <Button
                variant="primary"
                size="sm"
                onClick={handleAnalyzeStorage}
                disabled={storageAnalysisStatus === 'running'}
                className="w-full"
              >
                {storageAnalysisStatus === 'running' ? 'Analyzing...' : 'Analyze Size'}
              </Button>
              <StatusLine status={storageAnalysisStatus} />
              {storageAnalysisDetail && (
                <pre
                  className="text-[11px] mt-2 p-3 rounded-md overflow-auto whitespace-pre font-mono"
                  style={{
                    backgroundColor: 'var(--surface-3)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--surface-4)',
                    maxHeight: '320px',
                  }}
                >
                  {storageAnalysisDetail}
                </pre>
              )}
            </div>
          </Card>
          {/* Custom card for Stats Sync with year selector */}
          <Card className="flex flex-col h-full">
            <div className="mb-3">
              <h3 className="label-sm text-txt-primary m-0">Sync Player Stats</h3>
              <p className="text-xs mt-1 text-txt-tertiary leading-relaxed m-0">
                Recalculates all player stats from box scores for selected season
              </p>
            </div>
            <div className="mt-auto space-y-2">
              <Select
                size="sm"
                value={statsSyncYear}
                onChange={(e) => setStatsSyncYear(parseInt(e.target.value))}
              >
                {Array.from({ length: 10 }, (_, i) => currentDynasty.currentYear - i)
                  .filter(y => y >= (currentDynasty.startYear || 2024))
                  .map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
              </Select>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={statsSyncSkipGamesPlayed}
                  onChange={(e) => setStatsSyncSkipGamesPlayed(e.target.checked)}
                  className="w-3.5 h-3.5 rounded"
                  style={{ accentColor: 'var(--text-primary)' }}
                />
                <span className="text-xs text-txt-secondary">Keep existing games played</span>
              </label>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSyncAllStats}
                disabled={statsSyncStatus === 'running'}
                className="w-full"
              >
                {statsSyncStatus === 'running' ? 'Syncing...' : 'Sync Stats'}
              </Button>
              <StatusLine status={statsSyncStatus} />
            </div>
          </Card>
        </div>
      </div>

      {/* Duplicate Players Confirmation UI */}
      {duplicateGroups && duplicateGroups.length > 0 && (
        <Card style={{ borderLeft: '3px solid var(--accent-warning)' }}>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="label-sm text-txt-primary m-0">
              Found <span className="tabular">{duplicateGroups.length}</span> possible duplicate{duplicateGroups.length > 1 ? ' groups' : ''}
            </h3>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={handleCancelMerge}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirmMerge}
                disabled={selectedMergeGroups.size === 0}
              >
                Merge <span className="tabular">{selectedMergeGroups.size}</span> Selected
              </Button>
            </div>
          </div>

          <p className="text-xs text-txt-tertiary mb-3 m-0">
            Review each group below. Uncheck any groups that are actually different players with the same name.
          </p>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {duplicateGroups.map((group, idx) => (
              <div
                key={group.name}
                className="rounded-md p-3"
                style={{ backgroundColor: 'var(--surface-3)', border: '1px solid var(--surface-4)' }}
              >
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedMergeGroups.has(idx)}
                    onChange={() => toggleGroupSelection(idx)}
                    className="w-4 h-4 mt-0.5 rounded"
                    style={{ accentColor: 'var(--text-primary)' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="label-sm text-txt-primary capitalize">
                      {group.name} <span className="text-xs font-normal text-txt-tertiary tabular">({group.players.length} entries)</span>
                    </div>
                    <div className="mt-1 space-y-1">
                      {group.players.map((player, pIdx) => {
                        const years = player.teamsByYear ? Object.keys(player.teamsByYear).sort() : []
                        const teams = years.map(y => getTeamAbbrFromTid(player.teamsByYear[y]))
                        const uniqueTeams = [...new Set(teams)]

                        return (
                          <div key={player.pid} className="text-xs text-txt-secondary flex items-center gap-2">
                            <Badge variant={pIdx === 0 ? 'success' : 'default'} size="sm">
                              {pIdx === 0 ? 'Keep' : 'Merge'}
                            </Badge>
                            <span>
                              {player.position || '??'} •
                              PID <span className="tabular">{player.pid}</span> •
                              {uniqueTeams.length > 0 ? ` ${uniqueTeams.join(' → ')}` : ' No team'} •
                              {years.length > 0 ? ` Years: ${years[0]}${years.length > 1 ? `-${years[years.length - 1]}` : ''}` : ' No years'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </label>
              </div>
            ))}
          </div>

          <div className="mt-3 pt-3 flex items-center justify-between flex-wrap gap-2" style={{ borderTop: '1px solid var(--surface-4)' }}>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedMergeGroups(new Set(duplicateGroups.map((_, i) => i)))}
                className="text-xs text-txt-secondary hover:text-txt-primary underline"
              >
                Select All
              </button>
              <button
                onClick={() => setSelectedMergeGroups(new Set())}
                className="text-xs text-txt-secondary hover:text-txt-primary underline"
              >
                Deselect All
              </button>
            </div>
            <span className="text-xs text-txt-tertiary tabular">
              {selectedMergeGroups.size} of {duplicateGroups.length} selected
            </span>
          </div>
        </Card>
      )}

      {/* Advance Classes Modal */}
      <Modal
        isOpen={showAdvanceModal}
        onClose={() => setShowAdvanceModal(false)}
        title="Advance Player Classes"
        size="lg"
        footer={
          <>
            <div className="mr-auto text-sm text-txt-tertiary">
              Advancing <span className="tabular">{Object.values(advanceSelections).filter(Boolean).length}</span> players
            </div>
            <Button variant="ghost" onClick={() => setShowAdvanceModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmAdvance}
              disabled={Object.values(advanceSelections).filter(Boolean).length === 0}
            >
              Advance Selected
            </Button>
          </>
        }
      >
        <p className="text-sm text-txt-secondary m-0 mb-3">
          Select players to advance. Players with 4 or fewer games will be redshirted.
        </p>

        {/* Legend */}
        <div className="mb-3 p-3 rounded-md flex flex-wrap items-center gap-4 text-xs" style={{ backgroundColor: 'var(--surface-3)' }}>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--accent-warning)' }}></span>
            <span className="text-txt-secondary">4 or fewer games (will redshirt)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--accent-success)' }}></span>
            <span className="text-txt-secondary">5+ games (normal advance)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--surface-5)' }}></span>
            <span className="text-txt-secondary">No data (normal advance)</span>
          </div>
        </div>

        {/* Select All / Deselect All */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex gap-3">
            <button
              onClick={() => selectAllAdvance(true)}
              className="text-sm text-txt-secondary hover:text-txt-primary font-medium underline"
            >
              Select All
            </button>
            <button
              onClick={() => selectAllAdvance(false)}
              className="text-sm text-txt-secondary hover:text-txt-primary font-medium underline"
            >
              Deselect All
            </button>
          </div>
          <span className="text-sm text-txt-tertiary tabular">
            {Object.values(advanceSelections).filter(Boolean).length} of {getPlayersOnUserTeam().length} selected
          </span>
        </div>

        {/* Player List */}
        <div className="space-y-1">
          {getPlayersOnUserTeam().map(player => {
            const CLASS_PROGRESSION = {
              'Fr': 'So', 'RS Fr': 'RS So', 'So': 'Jr', 'RS So': 'RS Jr',
              'Jr': 'Sr', 'RS Jr': 'RS Sr', 'Sr': 'RS Sr', 'RS Sr': 'RS Sr'
            }
            const currentClass = player.year || '?'
            const isAlreadyRS = currentClass.startsWith('RS ')
            const gamesPlayed = player.gamesPlayedLastYear
            const willRedshirt = gamesPlayed !== null && gamesPlayed !== undefined && gamesPlayed <= 4 && !isAlreadyRS

            let newClass
            if (willRedshirt) {
              newClass = 'RS ' + currentClass
            } else {
              newClass = CLASS_PROGRESSION[currentClass] || currentClass
            }

            // Indicator color based on games played
            let indicatorColor = 'var(--surface-5)'
            if (gamesPlayed !== null && gamesPlayed !== undefined) {
              indicatorColor = gamesPlayed <= 4 ? 'var(--accent-warning)' : 'var(--accent-success)'
            }

            return (
              <label
                key={player.pid}
                className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer hover:bg-surface-3 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={advanceSelections[player.pid] || false}
                  onChange={() => toggleAdvanceSelection(player.pid)}
                  className="w-4 h-4 rounded"
                  style={{ accentColor: 'var(--text-primary)' }}
                />
                <span className="w-2 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: indicatorColor }}></span>
                <div className="flex-1 min-w-0 flex items-center gap-3">
                  <span className="w-12 label-xs text-txt-tertiary">{player.position}</span>
                  <span className="text-sm text-txt-primary truncate">{player.name}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-txt-tertiary w-16 text-right tabular">
                    {gamesPlayed !== null && gamesPlayed !== undefined ? `${gamesPlayed} GP` : 'No GP'}
                  </span>
                  <span className="text-txt-tertiary w-20 text-center">{currentClass}</span>
                  <span className="text-txt-tertiary">-&gt;</span>
                  <span
                    className="w-20 text-center font-medium"
                    style={{ color: willRedshirt ? 'var(--accent-warning)' : 'var(--accent-success)' }}
                  >
                    {newClass}
                  </span>
                </div>
              </label>
            )
          })}
        </div>
      </Modal>

      {/* Delete Specific Game Section */}
      <div>
        <SectionHeader
          size="sm"
          title="Delete Specific Game"
          subtitle="Manually remove a game that shouldn't exist"
        />
        <Card>
          {!showGameDeletion ? (
            <Button variant="danger" onClick={() => setShowGameDeletion(true)}>
              Show Games for Deletion
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-txt-secondary m-0">Select a game to delete:</p>
                <Button variant="ghost" size="sm" onClick={() => { setShowGameDeletion(false); setSelectedGameToDelete(null); }}>
                  Hide
                </Button>
              </div>

              <Select
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
              </Select>

              {selectedGameToDelete && (
                <div className="flex items-center gap-3 flex-wrap">
                  <Button variant="danger" onClick={() => handleDeleteGame(selectedGameToDelete)}>
                    Delete Selected Game
                  </Button>
                  {gameDeletionStatus && (
                    <span
                      className="text-sm"
                      style={{ color: gameDeletionStatus.success ? 'var(--accent-success)' : 'var(--accent-error)' }}
                    >
                      {gameDeletionStatus.message}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Use With Caution — these handlers were written for older
          dynasty schemas and have known failure modes on legacy
          dynasties (CFP repair has miswired user brackets / national
          championship winners; class fixers can clobber the canonical
          classByYear map). Each one prompts for a backup-acknowledged
          confirm before running. */}
      <div>
        <SectionHeader
          size="sm"
          title="Use With Caution"
          subtitle="Known to corrupt records on dynasties started on older builds — back up first."
        />
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          <ActionCard
            danger
            title="Repair CFP Games"
            description="Tries to fix misaligned CFP bracket slots, bowl names, and game links. Has miswired first-year brackets and assigned the wrong team a national championship on legacy dynasties."
            buttonText="Repair CFP"
            onClick={handleRepairCFPGames}
            status={cfpRepairStatus}
          />
          <ActionCard
            danger
            title="Fix Player Classes"
            description="Auto-fills entryYear / entryClass / classByYear by inference. Can overwrite the canonical classByYear map with stale legacy values."
            buttonText="Fix Classes"
            onClick={handleFixClassData}
            status={classDataFixStatus}
          />
          <ActionCard
            danger
            title="Advance Classes"
            description="Manually age up selected players. Use only when normal season advance didn't progress someone correctly — running this on already-advanced players double-progresses them."
            buttonText="Select Players"
            onClick={handleOpenAdvanceModal}
            status={advanceClassesStatus}
          />
        </div>
      </div>

      {/* Storage & Database Section */}
      <div>
        <SectionHeader size="sm" title="Storage & Database" />
        <Card>
          {/* Migration Status Badge */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: currentDynasty._subcollectionsMigrated ? 'var(--accent-success)' : 'var(--accent-warning)' }}
              />
              <span className="text-sm font-medium text-txt-primary">
                {currentDynasty._subcollectionsMigrated ? 'Subcollection Storage (Unlimited)' : 'Legacy Storage (1MB Limit)'}
              </span>
            </div>
            {!sizeAnalysis && (
              <Button variant="primary" size="sm" onClick={handleAnalyzeSize}>
                Analyze
              </Button>
            )}
          </div>

          {sizeAnalysis && (
            <div className="space-y-4">
              {/* Size Bar */}
              <div>
                <div className="flex justify-between text-xs mb-1 text-txt-secondary tabular">
                  <span>{sizeAnalysis.isMigrated ? sizeAnalysis.mainDocTotalKB : sizeAnalysis.totalKB} KB</span>
                  <span>{sizeAnalysis.isMigrated ? sizeAnalysis.mainDocPercentUsed : sizeAnalysis.percentUsed}% of 1MB</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface-3)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, parseFloat(sizeAnalysis.isMigrated ? sizeAnalysis.mainDocPercentUsed : sizeAnalysis.percentUsed))}%`,
                      backgroundColor:
                        parseFloat(sizeAnalysis.isMigrated ? sizeAnalysis.mainDocPercentUsed : sizeAnalysis.percentUsed) > 90 ? 'var(--accent-error)' :
                        parseFloat(sizeAnalysis.isMigrated ? sizeAnalysis.mainDocPercentUsed : sizeAnalysis.percentUsed) > 70 ? 'var(--accent-warning)' :
                        'var(--accent-success)'
                    }}
                  />
                </div>
              </div>

              {/* Subcollection Stats (if migrated) */}
              {sizeAnalysis.isMigrated && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-md text-center" style={{ backgroundColor: 'var(--surface-3)' }}>
                    <div className="text-2xl font-bold tabular text-txt-primary">{sizeAnalysis.subcollections.players.count}</div>
                    <div className="label-xs text-txt-tertiary mt-1">Players <span className="tabular">({sizeAnalysis.subcollections.players.sizeKB} KB)</span></div>
                  </div>
                  <div className="p-3 rounded-md text-center" style={{ backgroundColor: 'var(--surface-3)' }}>
                    <div className="text-2xl font-bold tabular text-txt-primary">{sizeAnalysis.subcollections.games.count}</div>
                    <div className="label-xs text-txt-tertiary mt-1">Games <span className="tabular">({sizeAnalysis.subcollections.games.sizeKB} KB)</span></div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2 pt-2" style={{ borderTop: '1px solid var(--surface-4)' }}>
                <Button variant="outline" size="sm" onClick={handleAnalyzeSize}>
                  Refresh
                </Button>

                {!currentDynasty._subcollectionsMigrated && (
                  <>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleSubcollectionMigration}
                      disabled={subcollectionMigrationStatus === 'running'}
                    >
                      {subcollectionMigrationStatus === 'running' ? 'Migrating...' : 'Migrate to Subcollections'}
                    </Button>

                    <label className="flex items-center gap-1.5 text-xs cursor-pointer text-txt-secondary">
                      <input
                        type="checkbox"
                        checked={removeOldBoxScores}
                        onChange={(e) => setRemoveOldBoxScores(e.target.checked)}
                        className="w-3 h-3 rounded"
                        style={{ accentColor: 'var(--text-primary)' }}
                      />
                      Remove old box scores
                    </label>

                    <Button
                      variant="danger"
                      size="sm"
                      onClick={handleOptimize}
                      disabled={optimizeStatus === 'running'}
                    >
                      {optimizeStatus === 'running' ? 'Optimizing...' : 'Optimize'}
                    </Button>
                  </>
                )}
              </div>

              {/* Status Messages */}
              <StatusLine status={subcollectionMigrationStatus} />
              <StatusLine status={optimizeStatus} />
            </div>
          )}
        </Card>

        {/* Per-team-per-week ranks migration. Force-rebuilds
            dynasty.teams[tid].byYear[year].rankByWeek from every
            stored game's team1Rank/team2Rank with the EA shift rule
            (CPU games' rank → entering next week; user games'
            rank → entering this week). Use when the displayed rank
            on a game card looks wrong and a hard refresh hasn't
            fixed it. Idempotent — running it again only overwrites
            with the freshly recomputed values. */}
        <Card className="p-4 sm:p-5">
          <div className="space-y-3">
            <div>
              <div className="text-display-sm text-txt-primary font-semibold">Rebuild per-team-per-week ranks</div>
              <p className="text-xs text-txt-secondary mt-1">
                Recomputes <code>dynasty.teams[tid].byYear[year].rankByWeek</code> from every stored game.
                Each game's stored rank IS the entering rank, so no shift is applied.
                Use when the Top 25 page disagrees with what each game record shows — this trusts the GAMES.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-2" style={{ borderTop: '1px solid var(--surface-4)' }}>
              <Button
                variant="primary"
                size="sm"
                onClick={handleRankByWeekMigration}
                disabled={rankByWeekStatus === 'running'}
              >
                {rankByWeekStatus === 'running' ? 'Rebuilding...' : 'Rebuild Ranks (from games)'}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSyncGamesFromRankByWeek}
                disabled={syncGamesStatus === 'running'}
              >
                {syncGamesStatus === 'running' ? 'Syncing...' : 'Sync Games (from Top 25)'}
              </Button>
            </div>
            <p className="text-[11px] text-txt-tertiary mt-1">
              "Sync Games" goes the OTHER direction — rewrites every game's stored rank to match the
              <code> rankByWeek</code> picture. Run this when you've edited the Top 25 sheet to fix
              a week's poll and the Game pages still show the old ranks.
            </p>
            <StatusLine status={rankByWeekStatus} />
            <StatusLine status={syncGamesStatus} />
          </div>
        </Card>
      </div>

      {/* Cache Section */}
      <div>
        <SectionHeader size="sm" title="Cache" />
        <div className="grid sm:grid-cols-2 gap-3">
          <Card className="flex flex-col h-full" style={{ borderLeft: '3px solid var(--accent-error)' }}>
            <div className="mb-3">
              <h3 className="label-sm text-txt-primary m-0">Clear Local Cache</h3>
              <p className="text-xs mt-1 text-txt-tertiary leading-relaxed m-0">
                Clears Google Sheets tokens and temp data
              </p>
            </div>
            <div className="mt-auto">
              <Button
                variant="danger"
                size="sm"
                onClick={handleClearCache}
                disabled={clearCacheStatus === 'running'}
                className="w-full"
              >
                {clearCacheStatus === 'running' ? 'Running...' : 'Clear Cache'}
              </Button>
              <StatusLine status={clearCacheStatus} />
            </div>
          </Card>
        </div>
      </div>


      {/* Storage Tier Testing (Dev) */}
      <div>
        <SectionHeader
          size="sm"
          title="Storage Tier Testing"
          subtitle="Dev tool - switch between IndexedDB and Firebase"
        />
        <Card>
          {/* Current Status */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: currentStorageTier === STORAGE_TIER.FREE ? 'var(--accent-info)' : 'var(--text-primary)' }}
              />
              <span className="text-sm font-medium text-txt-primary">
                Current: <strong>{currentStorageTier === STORAGE_TIER.FREE ? 'IndexedDB (Free)' : 'Firebase (Premium)'}</strong>
              </span>
            </div>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer text-txt-secondary">
              <input
                type="checkbox"
                checked={debugEnabled}
                onChange={(e) => {
                  setDebugEnabled(e.target.checked)
                  storageService.setDebug(e.target.checked)
                }}
                className="w-3 h-3 rounded"
                style={{ accentColor: 'var(--text-primary)' }}
              />
              Debug logs
            </label>
          </div>

          {/* Tier Toggle Buttons */}
          <div className="flex gap-2 mb-4">
            <Button
              variant={currentStorageTier === STORAGE_TIER.FREE ? 'primary' : 'outline'}
              size="sm"
              onClick={() => {
                storageService.setTier(STORAGE_TIER.FREE)
                console.log('[StorageTierTest] Switched to IndexedDB (Free tier) - reloading page...')
                window.location.reload()
              }}
              className="flex-1"
            >
              IndexedDB (Free)
            </Button>
            <Button
              variant={currentStorageTier === STORAGE_TIER.PREMIUM ? 'primary' : 'outline'}
              size="sm"
              onClick={() => {
                if (!user) {
                  toast.error('You must be logged in to test Firebase storage')
                  return
                }
                storageService.setTier(STORAGE_TIER.PREMIUM, user.uid)
                console.log('[StorageTierTest] Switched to Firebase (Premium tier) - reloading page...')
                window.location.reload()
              }}
              className="flex-1"
            >
              Firebase (Premium)
            </Button>
          </div>

          {/* Reset Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              storageService.clearPersistedTier()
              console.log('[StorageTierTest] Cleared persisted tier - reloading page...')
              window.location.reload()
            }}
            className="w-full mb-4"
          >
            Reset to Default (use user's actual tier)
          </Button>

          {/* IndexedDB Info */}
          <div className="space-y-2 text-xs text-txt-secondary">
            <div className="flex justify-between">
              <span>User ID:</span>
              <span className="font-mono text-txt-primary">{user?.uid || 'Not logged in'}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const info = await indexedDBStorage.getStorageInfo()
                setStorageInfo(info)
              }}
              className="w-full"
            >
              Check IndexedDB Storage Usage
            </Button>
            {storageInfo && (
              <div className="p-2 rounded-md text-xs tabular" style={{ backgroundColor: 'var(--surface-3)', border: '1px solid var(--surface-4)' }}>
                <div>Used: {(storageInfo.used / 1024 / 1024).toFixed(2)} MB</div>
                <div>Quota: {(storageInfo.quota / 1024 / 1024).toFixed(0)} MB</div>
                <div>Usage: {storageInfo.percent}%</div>
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="mt-4 p-3 rounded-md text-xs" style={{ backgroundColor: 'var(--surface-3)', borderLeft: '3px solid var(--accent-warning)' }}>
            <strong className="text-txt-primary">Testing instructions:</strong>
            <ol className="list-decimal ml-4 mt-1 space-y-1 text-txt-secondary">
              <li>Open browser console (F12) to see debug logs</li>
              <li>Switch between tiers (page will reload)</li>
              <li>Perform actions (save game, update roster, etc.)</li>
              <li>Watch console for [IndexedDB] or [Firebase] logs</li>
            </ol>
          </div>
        </Card>
      </div>

      {/* Teambuilder Section */}
      {teambuilderTeams.length > 0 && (
        <div>
          <SectionHeader
            size="sm"
            title="Teambuilder Teams"
            subtitle={`${teambuilderTeams.length} custom team${teambuilderTeams.length > 1 ? 's' : ''}`}
          />

          <div className="grid gap-3">
            {teambuilderTeams.map(team => {
              const originalAbbr = getOriginalTeamAbbr(team.tid)
              const originalName = originalAbbr ? getTeamName(originalAbbr) : TEAMS[team.tid]?.name || 'Unknown'

              return (
                <Card key={team.tid} accent="left" className="flex items-center gap-4">
                  {team.logo ? (
                    <img
                      src={team.logo}
                      alt={team.name}
                      className="w-12 h-12 object-contain rounded-md"
                      style={{ backgroundColor: 'var(--surface-3)', padding: '4px' }}
                    />
                  ) : (
                    <div
                      className="w-12 h-12 rounded-md flex items-center justify-center font-bold text-sm"
                      style={{ backgroundColor: team.primaryColor, color: team.secondaryColor }}
                    >
                      {team.abbr}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <h3 className="label-sm text-txt-primary truncate m-0">{team.name}</h3>
                    <p className="text-xs text-txt-tertiary m-0 mt-0.5">
                      {team.abbr} • Replaces {originalName}
                    </p>
                  </div>

                  <div className="flex gap-2 flex-shrink-0">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => { setSelectedTeambuilderTid(team.tid); setShowTeambuilderEditModal(true) }}
                    >
                      Edit
                    </Button>
                    <Link
                      to={`${pathPrefix}/team/${team.tid}`}
                      className="inline-flex items-center justify-center h-8 px-3 text-sm font-semibold rounded-md bg-transparent border border-surface-5 text-txt-primary hover:bg-surface-3 transition-colors"
                    >
                      View
                    </Link>
                  </div>
                </Card>
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
          dynastyTeams={currentDynasty?.teams || currentDynasty?.customTeams}
          teamColors={{ primary: 'var(--text-primary)', secondary: 'var(--team-secondary)' }}
          onSave={async (updates) => {
            const result = await updateTeambuilderTeam(currentDynasty.id, selectedTeambuilderTid, updates)
            if (!result.success) throw new Error(result.message)
          }}
        />
      )}
    </div>
  )
}
