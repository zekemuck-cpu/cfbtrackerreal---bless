import { useState, useRef, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useDynasty, propagateCFPWinner, GAME_TYPES, isPlayerOnRoster, rebuildRankByWeekFromCurrentState, syncGameRanksFromRankByWeek, getCustomConferencesForYear, getPlayerClassForYear, getRecruitingCommitments, computeScheduleDiff, applyScheduleDiff, getScheduleForTeam } from '../../context/DynastyContext'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../components/ui/Toast'
import { useConfirm } from '../../components/ui/ConfirmDialog'
import { useTeamColors } from '../../hooks/useTeamColors'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getTeamName } from '../../data/teamAbbreviations'
import { TEAMS, getOriginalTeamAbbr, getTidFromAbbr, getAbbrFromTid, resolveTid, getUserTeamTid, addCareerEntry } from '../../data/teamRegistry'
import { getTeamConference } from '../../data/conferenceTeams'
import { storageService, STORAGE_TIER, indexedDBStorage } from '../../services/storage'
import { swapBoxScoreTeams, hasAnyPlayerStats, hasAnyTeamStats } from '../../utils/boxScoreHelpers'
import TeambuilderEditModal from '../../components/TeambuilderEditModal'
import { SEED_TO_SLOT, getCFPGameId, DEFAULT_BOWL_CONFIG, getBowlForSlot } from '../../data/cfpConstants'
import { findMatchingPlayer, normalizePlayerName } from '../../utils/playerMatching'
import { migrateDynastyToV2 } from '../../data/migrateDynastyV2'
import { syncDerivedFieldsFromV2 } from '../../data/rosterModel'
import { EDITIONS, getEditionKey, getEditionConfig, isPcAutoDynasty } from '../../editions'
import { migrateLegacyCoachesToCids } from '../../data/coachModel'
import CalendarJumper from '../../components/CalendarJumper'
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

// ── NCAA 11 (2010-era) conference alignment ─────────────────────────────────
// Used by the "Migrate to NCAA 11" tool so dynasties built from older-game
// rosters (NCAA 11 on PS2/Xbox360) match that season's conferences instead of
// the modern 2024-25 default. Conference names reuse the app's canonical
// labels where the conference still exists (so logos / championships keep
// working); Big East and WAC are revived for this era. Teams that did not
// exist as FBS programs in 2010 (e.g. DEL, APP, CHAR, JMU, ODU, SHSU, KENN,
// LIB, GASO, GSU, JKST, CCU, TXST, USA, UTSA, MZST, MASS) are intentionally
// left unassigned — they show under "Other" rather than forcing the user to
// place phantom teams.
const NCAA11_CONFERENCES = {
  'ACC': ['BC', 'CLEM', 'DUKE', 'FSU', 'GT', 'UMD', 'MIA', 'UNC', 'NCST', 'UVA', 'VT', 'WAKE'],
  'Big East': ['UC', 'CONN', 'LOU', 'PITT', 'RUTG', 'USF', 'SYR', 'WVU'],
  'Big 12': ['BU', 'COLO', 'ISU', 'KU', 'KSU', 'MIZ', 'NEB', 'OU', 'OKST', 'TEX', 'TAMU', 'TTU'],
  'Big Ten': ['ILL', 'IU', 'IOWA', 'MICH', 'MSU', 'MINN', 'NU', 'OSU', 'PSU', 'PUR', 'WIS'],
  'Conference USA': ['ECU', 'UAB', 'UCF', 'UH', 'MRSH', 'MEM', 'RICE', 'SMU', 'USM', 'TULN', 'TLSA', 'UTEP'],
  'Independent': ['ND', 'NAVY', 'ARMY'],
  'MAC': ['AKR', 'BALL', 'BGSU', 'BUFF', 'CMU', 'EMU', 'KENT', 'M-OH', 'NIU', 'OHIO', 'TEM', 'TOL', 'WMU'],
  'Mountain West': ['AFA', 'BYU', 'CSU', 'UNM', 'SDSU', 'TCU', 'UTAH', 'WYO', 'UNLV'],
  'Pac-12': ['ARIZ', 'ASU', 'CAL', 'ORE', 'ORST', 'STAN', 'UCLA', 'USC', 'WASH', 'WSU'],
  'SEC': ['BAMA', 'ARK', 'AUB', 'FLA', 'UGA', 'UK', 'LSU', 'MISS', 'MSST', 'SCAR', 'UT', 'VAN'],
  'Sun Belt': ['ARST', 'FAU', 'FIU', 'MTSU', 'UNT', 'TROY', 'UL', 'ULM', 'WKU'],
  'WAC': ['BOIS', 'FRES', 'HAW', 'IDHO', 'LT', 'NEV', 'NMSU', 'SJSU', 'USU'],
}

// Idaho Vandals — dropped to FCS after the NCAA 11 era, so the team has no
// slot in the modern registry. The migration injects it into dynasty.teams at
// a fresh tid (it is NOT added to the global TEAMS list, so modern dynasties
// stay clean). Colors: Vandal Gold (#B3A369) and black.
const IDAHO_TEAM = {
  abbr: 'IDHO',
  name: 'Idaho Vandals',
  primaryColor: '#B3A369',
  secondaryColor: '#000000',
  logo: 'https://i.imgur.com/Fk9sVs0.png',
}

export default function DangerZone() {
  const { currentDynasty, dynasties, analyzeDocumentSize, optimizeDocumentSize, migrateToSubcollections, migrateConferencesToPerTeam, updateDynasty, updateTeambuilderTeam, exportDynasty, isViewOnly, syncAllPlayersStats, saveWeekRecap, deleteWeekRecap, addGame, recoverRecruitData, recoverRosterData, restoreDynastyFromBackup } = useDynasty()
  const { user } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const { id: dynastyId } = useParams()
  const pathPrefix = usePathPrefix()
  useTeamColors(currentDynasty?.teamName, currentDynasty?.teams || currentDynasty?.customTeams)
  // Gates the "Use With Caution" repair tools below — every one of them was
  // written for console (manual-entry) failure modes: roster carryover gaps
  // from advanceWeek's local logic, blank transfer years from Sheet import,
  // manual redshirt confirmation, CFP brackets from hand-entered results,
  // etc. None of those failure modes can occur on a PC dynasty (its roster/
  // transfers/classes/CFP data all come straight from the save every sync,
  // "save always wins"), so running one would do nothing useful at best —
  // or actively corrupt data the next sync would otherwise have kept
  // correct — at worst. isPcAutoDynasty, not isViewOnly: this is about
  // which tools are ever meaningful for this dynasty's data model, not
  // about edit permission.
  const isPc = isPcAutoDynasty(currentDynasty)

  // Status states
  const [clearCacheStatus, setClearCacheStatus] = useState(null)
  const [duplicateGameCleanupStatus, setDuplicateGameCleanupStatus] = useState(null)
  const [sizeAnalysis, setSizeAnalysis] = useState(null)
  const [optimizeStatus, setOptimizeStatus] = useState(null)
  const [removeOldBoxScores, setRemoveOldBoxScores] = useState(false)
  const [subcollectionMigrationStatus, setSubcollectionMigrationStatus] = useState(null)
  const [showTeambuilderEditModal, setShowTeambuilderEditModal] = useState(false)
  const [selectedTeambuilderTid, setSelectedTeambuilderTid] = useState(null)
  const [showHelp, setShowHelp] = useState(false)
  const [switchingEdition, setSwitchingEdition] = useState(false)
  const [coachMigrateStatus, setCoachMigrateStatus] = useState(null)

  // Build cid coach profiles from legacy OC/DC names across every season.
  const handleMigrateCoaches = async () => {
    if (isViewOnly) return
    setCoachMigrateStatus('running')
    try {
      const { coaches, created, seasonsAdded } = migrateLegacyCoachesToCids(currentDynasty)
      await updateDynasty(dynastyId, { coaches })
      setCoachMigrateStatus('success')
      toast.success(`Built ${created} coach profile${created === 1 ? '' : 's'} · ${seasonsAdded} season${seasonsAdded === 1 ? '' : 's'} added`)
    } catch (e) {
      console.error('[DangerZone] coach migration failed:', e)
      setCoachMigrateStatus('error')
      toast.error('Coach migration failed. Please try again.')
    }
  }

  // Switch which game edition this dynasty is tracked as. This is a
  // mislabel fix, not a migration: it only changes which features/rules
  // apply going forward. Players, games, and stats are untouched, and it's
  // reversible. Stored data (e.g. Dynasty Points) simply lies dormant when
  // an edition that doesn't use it is selected.
  const handleSwitchEdition = async (key) => {
    const currentKey = getEditionKey(currentDynasty)
    if (key === currentKey || switchingEdition) return
    const target = getEditionConfig(key)
    const ok = await confirm({
      title: `Switch to ${target.label}?`,
      message: `Track this dynasty as ${target.label}. This only changes which edition features and rules apply — your players, games, and stats are untouched. You can switch back anytime.`,
      confirmLabel: `Switch to ${target.label}`,
    })
    if (!ok) return
    setSwitchingEdition(true)
    try {
      await updateDynasty(dynastyId, { gameEdition: key })
      toast.success(`Now tracking as ${target.label}`)
    } catch (e) {
      console.error('[DangerZone] edition switch failed:', e)
      toast.error('Failed to switch edition. Please try again.')
    } finally {
      setSwitchingEdition(false)
    }
  }

  const [clearStorageStatus, setClearStorageStatus] = useState(null)

  // Storage tier testing state
  const [currentStorageTier, setCurrentStorageTier] = useState(storageService.getTier())
  const [debugEnabled, setDebugEnabled] = useState(true)
  const [storageInfo, setStorageInfo] = useState(null)

  // CFP repair state
  const [cfpRepairStatus, setCfpRepairStatus] = useState(null)

  // Conference migration state

  // CCG repair state
  // CCG mis-flag cleanup state — finds games incorrectly tagged as
  // conference championships (e.g. Army-Navy was being auto-promoted
  // before the Week-15-only fix) and removes the flag.
  // CCG restore state — re-flags games that look like CCGs but lost
  // the flag (e.g. an over-aggressive earlier version of the Unflag
  // tool that stripped any CCG without an exact Week 15 marker).

  // Game deletion state
  const [showGameDeletion, setShowGameDeletion] = useState(false)
  const [selectedGameToDelete, setSelectedGameToDelete] = useState(null)
  const [gameDeletionStatus, setGameDeletionStatus] = useState(null)

  // Box score swap state
  const [showBoxScoreSwap, setShowBoxScoreSwap] = useState(false)
  const [selectedGameToSwap, setSelectedGameToSwap] = useState(null)
  const [boxScoreSwapStatus, setBoxScoreSwapStatus] = useState(null)

  // Honors sync state

  // v2 Consolidation state
  const [v2ConsolidateStatus, setV2ConsolidateStatus] = useState(null)

  // Duplicate player merge state
  const [duplicateMergeStatus, setDuplicateMergeStatus] = useState(null)
  const [duplicateGroups, setDuplicateGroups] = useState(null) // Groups pending confirmation
  // The confirmation panel renders at the BOTTOM of the page while the
  // "Merge Players" button sits mid-page in the tools grid. Without this
  // scroll, a successful detection looked like the button did NOTHING: the
  // status line is cleared (no green text) and the panel appears off-screen.
  // A user reported exactly that — "when I do the merge players I'm not
  // getting anything, so I don't know if it's not going through or what."
  const duplicatePanelRef = useRef(null)
  useEffect(() => {
    if (duplicateGroups && duplicateGroups.length > 0) {
      duplicatePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [duplicateGroups])
  const [selectedMergeGroups, setSelectedMergeGroups] = useState(new Set()) // Which groups to merge

  // Preseason recap location fix state

  // Class data fix state
  const [transferYearFixStatus, setTransferYearFixStatus] = useState(null)
  const [rebuildCarryoverStatus, setRebuildCarryoverStatus] = useState(null)
  const [removeResurrectedStatus, setRemoveResurrectedStatus] = useState(null)
  const [localBackups, setLocalBackups] = useState(null) // null = not loaded yet
  const [backupStatus, setBackupStatus] = useState(null)
  const [restoreFileStatus, setRestoreFileStatus] = useState(null)
  const restoreFileInputRef = useRef(null)
  const [recoverRecruitSourceId, setRecoverRecruitSourceId] = useState('')
  const [recoverRecruitStatus, setRecoverRecruitStatus] = useState(null)
  const [clearRosterStatus, setClearRosterStatus] = useState(null)
  const [resetCfb27Status, setResetCfb27Status] = useState(null)
  const [rebuildGamesStatus, setRebuildGamesStatus] = useState(null)
  const [ncaa11Status, setNcaa11Status] = useState(null)
  const [playAsIdaho, setPlayAsIdaho] = useState(false)
  const [advanceClassesStatus, setAdvanceClassesStatus] = useState(null)
  const [showAdvanceModal, setShowAdvanceModal] = useState(false)
  const [advanceSelections, setAdvanceSelections] = useState({}) // { pid: boolean }

  // Stats sync state
  const [statsSyncStatus, setStatsSyncStatus] = useState(null)
  const [statsSyncYear, setStatsSyncYear] = useState(currentDynasty?.currentYear || new Date().getFullYear())
  const [statsSyncSkipGamesPlayed, setStatsSyncSkipGamesPlayed] = useState(false) // Option to skip updating games played/snaps

  // Schedule link fix state
  const [storageAnalysisStatus, setStorageAnalysisStatus] = useState(null)
  const [storageAnalysisDetail, setStorageAnalysisDetail] = useState(null)
  const [commitCheckStatus, setCommitCheckStatus] = useState(null)
  const [commitCheckDetail, setCommitCheckDetail] = useState(null)
  const [commitDrifted, setCommitDrifted] = useState(null) // array of {tid, year, abbr} pending re-sync

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

  const handleClearStorage = async () => {
    const confirmed = await confirm({
      title: 'Clear All App Storage?',
      message: 'This permanently deletes the local IndexedDB database and all cached dynasty data. Use this if you\'re seeing "full disk" or storage errors. You cannot undo this.',
      confirmText: 'Delete all local storage',
      variant: 'danger',
    })
    if (!confirmed) return
    setClearStorageStatus('running')
    try {
      await indexedDBStorage.deleteDatabase()
      setClearStorageStatus({ success: true, message: 'All local storage cleared. Reload the page to start fresh.' })
    } catch (err) {
      setClearStorageStatus({ success: false, message: 'Failed: ' + err.message })
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
        lines.push('⚠️  COULD NOT READ FROM FIRESTORE. Falling back to in-memory state.')
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
        'teamRatingsByTeamYear', 'teamRecordsByTeamYear', 'teamCalculatedRecordByTeamYear',
        'trainingResultsByTeamYear', 'transferDestinationsByTeamYear',
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

  // Recruiting-commitment consistency check (read-only). Commitments live in two
  // dual-keyed stores that are supposed to mirror each other: the tid-based
  // teams.byYear store and recruitingCommitmentsByTeamYear. They can drift
  // because teams is replace-persisted while byTeamYear is merge-persisted. The
  // app reads the UNION so nothing is ever lost, but this flags any team-year
  // where the two disagree and offers a one-click re-sync (writes the per-record
  // union of both back to both — strictly additive, never removes a commit).
  const commitStoresForTid = (tid) => {
    const teams = currentDynasty?.teams || {}
    const bty = currentDynasty?.recruitingCommitmentsByTeamYear || {}
    const abbr = getAbbrFromTid(teams, tid)
    return {
      abbr,
      fromTeams: (y) => teams?.[tid]?.byYear?.[y]?.recruitingCommitments || {},
      fromBTY: (y) => (bty?.[tid]?.[y]) || (abbr && bty?.[abbr]?.[y]) || {},
    }
  }
  // Signature = each bucket's key + record count, sorted. Different signatures
  // between the two stores means they've drifted (a missing bucket or a count
  // mismatch — exactly what the clobber bug produced).
  const commitSig = (obj) => Object.entries(obj || {})
    .filter(([, v]) => Array.isArray(v))
    .map(([k, v]) => `${k}:${v.length}`)
    .sort()
    .join(', ')

  const handleCheckCommitments = () => {
    setCommitCheckStatus('running')
    setCommitCheckDetail(null)
    setCommitDrifted(null)
    try {
      const teams = currentDynasty?.teams || {}
      const bty = currentDynasty?.recruitingCommitmentsByTeamYear || {}

      // Collect every (tid, year) that has commitments in either store.
      const pairs = new Map() // `${tid}|${year}` -> { tid, year }
      const addPair = (tid, year) => {
        if (tid == null || !Number.isFinite(Number(tid))) return
        pairs.set(`${Number(tid)}|${year}`, { tid: Number(tid), year: Number(year) })
      }
      for (const [tidStr, td] of Object.entries(teams)) {
        for (const [year, yd] of Object.entries(td?.byYear || {})) {
          if (yd?.recruitingCommitments && Object.keys(yd.recruitingCommitments).length) addPair(tidStr, year)
        }
      }
      for (const [key, years] of Object.entries(bty)) {
        const tid = /^\d+$/.test(key) ? Number(key) : getTidFromAbbr(key, currentDynasty)
        for (const [year, obj] of Object.entries(years || {})) {
          if (obj && typeof obj === 'object' && Object.keys(obj).length) addPair(tid, year)
        }
      }

      const drifted = []
      for (const { tid, year } of pairs.values()) {
        const { abbr, fromTeams, fromBTY } = commitStoresForTid(tid)
        const sT = commitSig(fromTeams(year))
        const sB = commitSig(fromBTY(year))
        if (sT !== sB) drifted.push({ tid, year, abbr, sigTeams: sT, sigBTY: sB })
      }
      drifted.sort((a, b) => (a.abbr || '').localeCompare(b.abbr || '') || a.year - b.year)

      const lines = []
      lines.push(`Scanned ${pairs.size} team-year commitment record${pairs.size === 1 ? '' : 's'}.`)
      lines.push(`In sync: ${pairs.size - drifted.length}`)
      lines.push(`Drifted: ${drifted.length}`)
      if (drifted.length) {
        lines.push('')
        for (const d of drifted) {
          lines.push(`${d.abbr || `tid ${d.tid}`} ${d.year}`)
          lines.push(`   teams store:      ${d.sigTeams || '(none)'}`)
          lines.push(`   byTeamYear store: ${d.sigBTY || '(none)'}`)
        }
        lines.push('')
        lines.push('No data is lost — the app reads the union of both, so every commit still shows. Re-sync rewrites the union to both stores so they match.')
      } else {
        lines.push('')
        lines.push('Both stores agree everywhere. Nothing to fix.')
      }

      setCommitCheckDetail(lines.join('\n'))
      setCommitDrifted(drifted.length ? drifted : null)
      setCommitCheckStatus({ success: true, message: drifted.length ? `${drifted.length} season${drifted.length === 1 ? '' : 's'} drifted — see below` : 'All stores in sync' })
    } catch (err) {
      console.error('[CommitCheck] failed:', err)
      setCommitCheckDetail(`Check failed: ${err?.message || 'unknown error'}`)
      setCommitCheckStatus({ success: false, message: 'Check failed' })
    }
  }

  // Per-bucket, per-record union of two commitment objects — dedup by pid then
  // name so NO commit is ever dropped (the repair is strictly additive).
  const unionCommitmentObjects = (a, b) => {
    const out = {}
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})])
    for (const k of keys) {
      const arrA = Array.isArray(a?.[k]) ? a[k] : []
      const arrB = Array.isArray(b?.[k]) ? b[k] : []
      const seen = new Set()
      const merged = []
      for (const rec of [...arrA, ...arrB]) {
        const id = rec?.pid != null ? `p${rec.pid}` : `n${String(rec?.name || '').toLowerCase().trim()}`
        if (id === 'n' || seen.has(id)) { if (id === 'n') merged.push(rec); continue }
        seen.add(id)
        merged.push(rec)
      }
      out[k] = merged
    }
    return out
  }

  const handleResyncCommitments = async () => {
    if (isViewOnly || !commitDrifted?.length) return
    const ok = await confirm({
      title: 'Re-sync recruiting commitments?',
      message: `This rewrites the per-record union of both stores back to both for ${commitDrifted.length} team-year${commitDrifted.length === 1 ? '' : 's'}. It only adds/heals — it never removes a commit.`,
      confirmLabel: 'Re-sync',
    })
    if (!ok) return
    setCommitCheckStatus('running')
    try {
      let teamsUpdate = { ...(currentDynasty.teams || {}) }
      let btyUpdate = { ...(currentDynasty.recruitingCommitmentsByTeamYear || {}) }
      for (const { tid, year, abbr } of commitDrifted) {
        const { fromTeams, fromBTY } = commitStoresForTid(tid)
        const union = unionCommitmentObjects(fromTeams(year), fromBTY(year))
        const td = teamsUpdate[tid] || {}
        const by = td.byYear || {}
        const yd = by[year] || {}
        teamsUpdate = { ...teamsUpdate, [tid]: { ...td, byYear: { ...by, [year]: { ...yd, recruitingCommitments: union } } } }
        if (abbr) btyUpdate = { ...btyUpdate, [abbr]: { ...(btyUpdate[abbr] || {}), [year]: union } }
        btyUpdate = { ...btyUpdate, [tid]: { ...(btyUpdate[tid] || {}), [year]: union } }
      }
      await updateDynasty(currentDynasty.id, {
        teams: teamsUpdate,
        recruitingCommitmentsByTeamYear: btyUpdate,
      })
      toast.success(`Re-synced ${commitDrifted.length} team-year${commitDrifted.length === 1 ? '' : 's'}.`)
      setCommitDrifted(null)
      handleCheckCommitments()
    } catch (err) {
      console.error('[CommitResync] failed:', err)
      toast.error(`Re-sync failed: ${err?.message || 'unknown error'}`)
      setCommitCheckStatus({ success: false, message: 'Re-sync failed' })
    }
  }

  // Backfill blank TRANSFER/ARRIVAL years. Older transfers only wrote
  // teamsByYear[arrivalYear] without the companion class/OVR/dev maps, so the
  // arrival year rendered blank ("the skipped year" bug). For every year a
  // player is on a roster (teamsByYear) that's missing class/OVR/dev, fill from
  // the most recent prior year that has them — aging the class one step.
  const handleFixTransferYears = async () => {
    setTransferYearFixStatus('running')
    try {
      const CLASS_PROGRESSION = {
        'HS': 'Fr', 'JUCO Fr': 'Fr', 'JUCO So': 'So', 'JUCO Jr': 'Jr', 'JUCO Sr': 'Sr',
        'Fr': 'So', 'RS Fr': 'RS So', 'So': 'Jr', 'RS So': 'RS Jr', 'Jr': 'Sr', 'RS Jr': 'RS Sr',
      }
      const num = (m, y) => (m?.[y] ?? m?.[String(y)])
      let fixedPlayers = 0, fixedYears = 0
      const updatedPlayers = (currentDynasty.players || []).map(player => {
        if (player.isHonorOnly) return player
        const teamsByYear = player.teamsByYear || {}
        const years = Object.keys(teamsByYear).map(Number).filter(Number.isFinite).sort((a, b) => a - b)
        if (years.length === 0) return player

        const cls = { ...(player.classByYear || {}) }
        const ovr = { ...(player.overallByYear || {}) }
        const dev = { ...(player.devTraitByYear || {}) }
        let changed = false

        for (const y of years) {
          const hasCls = num(cls, y) != null && num(cls, y) !== ''
          const hasOvr = num(ovr, y) != null
          const hasDev = num(dev, y) != null && num(dev, y) !== ''
          if (hasCls && hasOvr && hasDev) continue

          // Find the nearest prior year (with data) to carry forward from.
          let prior = null
          for (let py = y - 1; py >= years[0] - 1; py--) {
            if (num(cls, py) != null || num(ovr, py) != null || num(dev, py) != null) { prior = py; break }
          }
          if (prior == null) continue // nothing earlier to derive from — leave as-is

          const priorCls = num(cls, prior)
          if (!hasCls && priorCls) { cls[String(y)] = CLASS_PROGRESSION[priorCls] || priorCls; changed = true; fixedYears++ }
          if (!hasOvr && num(ovr, prior) != null) { ovr[String(y)] = num(ovr, prior); changed = true }
          if (!hasDev && num(dev, prior)) { dev[String(y)] = num(dev, prior); changed = true }
        }

        if (!changed) return player
        fixedPlayers++
        return { ...player, classByYear: cls, overallByYear: ovr, devTraitByYear: dev }
      })

      if (fixedPlayers === 0) {
        setTransferYearFixStatus({ success: true, message: 'No blank transfer years found — all good.' })
        return
      }
      await updateDynasty(currentDynasty.id, { players: updatedPlayers })
      setTransferYearFixStatus({ success: true, message: `Backfilled ${fixedYears} year(s) across ${fixedPlayers} player(s).` })
    } catch (error) {
      setTransferYearFixStatus({ success: false, message: 'Fix failed: ' + error.message })
    }
  }

  // Rebuild missing season-to-season roster carryover. When a year flip didn't
  // write teamsByYear[Y] for returning players (skipped/interrupted advance,
  // the old memberTeamOf mis-route, or a migration that trimmed a year), that
  // season's roster shows empty. This re-derives the gap: for every member-
  // controlled team, whenever a player was on that team in year Y-1, hasn't
  // graduated, and hasn't departed-without-returning by Y-1, it fills
  // teamsByYear[Y] with the same team and ages the class. Conservative — it
  // only ADDS missing years (never overwrites), respects departures/graduation
  // so it can't resurrect players who truly left, and skips recruits.
  const handleRebuildCarryover = async () => {
    setRebuildCarryoverStatus('running')
    try {
      const CLASS_PROGRESSION = {
        'HS': 'Fr', 'JUCO Fr': 'Fr', 'JUCO So': 'So', 'JUCO Jr': 'Jr', 'JUCO Sr': 'Sr',
        'Fr': 'So', 'RS Fr': 'RS So', 'So': 'Jr', 'RS So': 'RS Jr', 'Jr': 'Sr', 'RS Jr': 'RS Sr',
      }
      const TERMINAL_CLASS = new Set(['Sr', 'RS Sr'])
      const currentYear = Number(currentDynasty.currentYear)
      const startYear = Number(currentDynasty.startYear) || (currentYear - 30)

      // Member-controlled tids (own team + every member's teams).
      const memberTids = new Set()
      const ownTid = currentDynasty.currentTid ?? getUserTeamTid(currentDynasty)
      if (ownTid != null) { const n = Number(ownTid); if (Number.isFinite(n)) memberTids.add(n) }
      for (const tids of Object.values(currentDynasty.memberTeams || {})) {
        for (const t of (Array.isArray(tids) ? tids : [])) {
          const n = Number(t); if (Number.isFinite(n)) memberTids.add(n)
        }
      }
      if (memberTids.size === 0) {
        setRebuildCarryoverStatus({ success: false, message: 'No member-controlled team found — cannot rebuild.' })
        return
      }

      const num = (m, y) => (m?.[y] ?? m?.[String(y)])
      const toTid = (v) => v == null ? null : (typeof v === 'number' ? v : getTidFromAbbr(v, currentDynasty))

      // Did the player depart this team on/before `throughYear` and NOT return?
      // Reads both v2 movementByYear and legacy movements[]. A later arrival /
      // recommit, or a surviving teamsByYear year back on this team, counts as
      // a return.
      const DEP_TYPES = new Set(['departure', 'entered_portal', 'transferred_out', 'graduated', 'declared_for_draft', 'encouraged_to_transfer'])
      const ARR_TYPES = new Set(['arrival', 'recommit', 'recommitted', 'recruited', 'transfer', 'portal_in', 'added'])
      const departedBy = (player, homeTid, throughYear) => {
        const entries = []
        for (const [y, m] of Object.entries(player.movementByYear || {})) entries.push([Number(y), m])
        for (const m of (Array.isArray(player.movements) ? player.movements : [])) entries.push([Number(m?.year), m])
        let earliestDep = null
        for (const [y, m] of entries) {
          if (!Number.isFinite(y) || y > throughYear) continue
          if (m?.type && DEP_TYPES.has(m.type)) { if (earliestDep == null || y < earliestDep) earliestDep = y }
        }
        if (earliestDep == null) return false
        const returnedViaMovement = entries.some(([y, m]) =>
          Number.isFinite(y) && y > earliestDep && m?.type && ARR_TYPES.has(m.type)
        )
        const returnedViaTby = Object.entries(player.teamsByYear || {}).some(([yStr, v]) => {
          const y = Number(yStr)
          return Number.isFinite(y) && y > earliestDep && toTid(v) === homeTid
        })
        return !(returnedViaMovement || returnedViaTby)
      }

      let filledPlayers = 0, filledYears = 0
      const updated = (currentDynasty.players || []).map(player => {
        if (player.isHonorOnly || player.isRecruit) return player
        const tby = { ...(player.teamsByYear || {}) }
        const cls = { ...(player.classByYear || {}) }
        let changed = false
        for (let y = startYear + 1; y <= currentYear; y++) {
          if (num(tby, y) != null) continue
          const prevTid = toTid(num(tby, y - 1))
          if (prevTid == null || !memberTids.has(prevTid)) continue
          if (departedBy(player, prevTid, y - 1)) continue
          const priorClass = getPlayerClassForYear(player, y - 1)
          if (priorClass == null || TERMINAL_CLASS.has(priorClass)) continue // graduated
          tby[String(y)] = prevTid
          if (num(cls, y) == null) cls[String(y)] = CLASS_PROGRESSION[priorClass] || priorClass
          changed = true
          filledYears++
        }
        if (!changed) return player
        filledPlayers++
        return { ...player, teamsByYear: tby, classByYear: cls }
      })

      if (filledPlayers === 0) {
        setRebuildCarryoverStatus({ success: true, message: 'No missing carryover years found — every returning player already has their roster years.' })
        return
      }
      await updateDynasty(currentDynasty.id, { players: updated })
      setRebuildCarryoverStatus({ success: true, message: `Rebuilt ${filledYears} roster year(s) across ${filledPlayers} player(s). Reload to see the restored roster.` })
    } catch (error) {
      setRebuildCarryoverStatus({ success: false, message: 'Rebuild failed: ' + (error?.message || 'unknown error') })
    }
  }

  // Remove "ghost" roster years: seasons a player is still rostered AFTER a
  // recorded departure they never returned from. Past builds of the season
  // advance only consulted the Players Leaving list (not movementByYear), so
  // players whose departure lived only in movement records — Draft Results
  // rounds, player-editor transfers/graduations — got carried forward again
  // ("my players who would have left ended up just coming back"). The
  // advance is fixed; this repairs dynasties that already have the ghosts.
  //
  // Departure/return is judged by MOVEMENT records only — teamsByYear can't
  // vouch for a return here because the ghost years ARE the false evidence.
  // Only member-controlled teams are touched, and the class/OVR/dev-trait
  // per-year entries written alongside a ghost year are cleaned with it.
  const handleRemoveResurrected = async () => {
    const ok = await confirm({
      title: 'Remove returned departures?',
      message: 'This removes roster years that a departed player (graduated, drafted, transferred out) wrongly got back after advancing the season. Players who truly returned via a recorded recommit or transfer-in are kept. Export a backup first if you want a safety net. Continue?',
      confirmLabel: 'Remove Ghost Years',
      variant: 'danger',
    })
    if (!ok) return

    setRemoveResurrectedStatus('running')
    try {
      const memberTids = new Set()
      const ownTid = currentDynasty.currentTid ?? getUserTeamTid(currentDynasty)
      if (ownTid != null) { const n = Number(ownTid); if (Number.isFinite(n)) memberTids.add(n) }
      for (const tids of Object.values(currentDynasty.memberTeams || {})) {
        for (const t of (Array.isArray(tids) ? tids : [])) {
          const n = Number(t); if (Number.isFinite(n)) memberTids.add(n)
        }
      }
      if (memberTids.size === 0) {
        setRemoveResurrectedStatus({ success: false, message: 'No member-controlled team found — nothing to repair.' })
        return
      }

      const toTid = (v) => v == null ? null : (typeof v === 'number' ? v : getTidFromAbbr(v, currentDynasty))
      const DEP_TYPES = new Set(['departure', 'entered_portal', 'transferred_out', 'graduated', 'declared_for_draft', 'encouraged_to_transfer'])
      const ARR_TYPES = new Set(['arrival', 'recommit', 'recommitted', 'recruited', 'transfer', 'portal_in', 'added'])
      const V2_DEP_SHAPES = new Set(['transfer_out', 'graduated', 'pro_draft'])
      const V2_ARR_SHAPES = new Set(['recruit', 'transfer_in', 'walk_on', 'juco'])

      // Earliest departure from homeTid with no later movement-recorded
      // return. Returns null when the player never left or came back.
      const unresolvedDepartureYear = (player, homeTid) => {
        const entries = []
        for (const [y, m] of Object.entries(player.movementByYear || {})) entries.push([Number(y), m])
        for (const m of (Array.isArray(player.movements) ? player.movements : [])) entries.push([Number(m?.year), m])
        let dep = null
        for (const [y, m] of entries) {
          if (!Number.isFinite(y)) continue
          const isDep = (m?.type && DEP_TYPES.has(m.type)) || (m?.departure && V2_DEP_SHAPES.has(m.departure))
          if (!isDep) continue
          // A transfer_out whose destination is THIS team is an arrival
          // mis-stored by an import, not a departure from us.
          if (m?.departure === 'transfer_out' && toTid(m?.toTid) === homeTid) continue
          if (dep == null || y < dep) dep = y
        }
        if (dep == null) return null
        const returned = entries.some(([y, m]) => {
          if (!Number.isFinite(y) || y <= dep) return false
          if (m?.type && ARR_TYPES.has(m.type)) return true
          if (m?.arrival && V2_ARR_SHAPES.has(m.arrival)) return true
          return false
        })
        return returned ? null : dep
      }

      let strippedPlayers = 0, strippedYears = 0
      const sampleNames = []
      const updated = (currentDynasty.players || []).map(player => {
        if (player.isHonorOnly || player.isRecruit) return player
        const tby = { ...(player.teamsByYear || {}) }
        const cls = { ...(player.classByYear || {}) }
        const ovr = { ...(player.overallByYear || {}) }
        const dev = { ...(player.devTraitByYear || {}) }
        let changed = false
        for (const [yStr, v] of Object.entries(player.teamsByYear || {})) {
          const y = Number(yStr)
          if (!Number.isFinite(y)) continue
          const tid = toTid(v)
          if (tid == null || !memberTids.has(tid)) continue
          const dep = unresolvedDepartureYear(player, tid)
          if (dep == null || y <= dep) continue
          delete tby[yStr]
          delete cls[yStr]
          delete ovr[yStr]
          delete dev[yStr]
          changed = true
          strippedYears++
        }
        if (!changed) return player
        strippedPlayers++
        if (sampleNames.length < 8 && player.name) sampleNames.push(player.name)
        return { ...player, teamsByYear: tby, classByYear: cls, overallByYear: ovr, devTraitByYear: dev }
      })

      if (strippedPlayers === 0) {
        setRemoveResurrectedStatus({ success: true, message: 'No ghost roster years found — no departed player is still on a later roster.' })
        return
      }
      await updateDynasty(currentDynasty.id, { players: updated })
      const names = sampleNames.length ? ` (${sampleNames.join(', ')}${strippedPlayers > sampleNames.length ? ', …' : ''})` : ''
      setRemoveResurrectedStatus({ success: true, message: `Removed ${strippedYears} ghost roster year(s) from ${strippedPlayers} player(s)${names}. Reload to see the corrected roster.` })
    } catch (error) {
      setRemoveResurrectedStatus({ success: false, message: 'Repair failed: ' + (error?.message || 'unknown error') })
    }
  }

  // ─── Local backups (safeguard against a bad write / browser clear) ───
  // The app keeps a rolling ring of the last few known-good local-dynasty
  // snapshots in IndexedDB. Surface them here so a user can restore in-app
  // instead of losing data. Restore MERGES by id (never deletes newer work).
  const loadLocalBackups = async () => {
    try {
      const backups = await indexedDBStorage.getBackups()
      setLocalBackups(backups.slice().reverse()) // newest first
    } catch (err) {
      console.error('[DangerZone] load backups failed:', err)
      setLocalBackups([])
    }
  }

  const handleRestoreBackup = async (ts, count) => {
    const ok = await confirm({
      title: 'Restore this backup?',
      message: `This merges ${count} dynasty snapshot(s) from ${new Date(ts).toLocaleString()} back into your local dynasties. Existing dynasties with the same ID are replaced with the snapshot; anything created since is kept. Continue?`,
      confirmLabel: 'Restore',
      variant: 'primary',
    })
    if (!ok) return
    setBackupStatus('running')
    try {
      const { restored } = await indexedDBStorage.restoreBackup(ts)
      setBackupStatus({ success: true, message: `Restored ${restored} dynasty snapshot(s). Reload the page to see them.` })
    } catch (err) {
      console.error('[DangerZone] restore failed:', err)
      setBackupStatus({ success: false, message: 'Restore failed: ' + (err?.message || 'unknown error') })
    }
  }

  // ─── Recover Data from Another Save ──────────────────────────────────
  // Copy the ROSTER + Recruiting Database + committed recruits from another of
  // the user's saves into this one. For users whose roster/recruits came over
  // empty after switching a save from local to cloud (or any storage switch) —
  // point it at a save that still has the data. Additive only: it unions the
  // source into this dynasty and never deletes or overwrites what's here.
  const handleRecoverRecruits = async () => {
    if (!recoverRecruitSourceId) {
      setRecoverRecruitStatus({ success: false, message: 'Pick a save to copy data from first.' })
      return
    }
    const source = (dynasties || []).find(d => String(d.id) === String(recoverRecruitSourceId))
    const ok = await confirm({
      title: 'Recover data?',
      message: `This copies the ROSTER, Recruiting Database, and committed recruits from "${source?.name || source?.teamName || 'the selected save'}" into this dynasty. It only ADDS data — nothing here is deleted or overwritten. Continue?`,
      confirmLabel: 'Recover Data',
      variant: 'primary',
    })
    if (!ok) return
    setRecoverRecruitStatus('running')
    try {
      // Roster first, then recruits — independent, additive, either can no-op.
      const rosterResult = await recoverRosterData(recoverRecruitSourceId, currentDynasty.id)
      const recruitResult = await recoverRecruitData(recoverRecruitSourceId, currentDynasty.id)

      const parts = []
      if (rosterResult?.success) {
        parts.push(`${rosterResult.added} player(s) added (roster now ${rosterResult.total})`)
      }
      if (recruitResult?.success) {
        parts.push(`${recruitResult.dbCount} Recruiting Database recruit(s) and ${recruitResult.committedCount} committed recruit slot(s)`)
      }

      if (parts.length > 0) {
        setRecoverRecruitStatus({
          success: true,
          message: `Recovered: ${parts.join('; ')}. Reload the page to see everything.`,
        })
      } else {
        // Neither succeeded — surface the most specific error we got.
        setRecoverRecruitStatus({
          success: false,
          message: rosterResult?.error || recruitResult?.error || 'Nothing to recover from that save.',
        })
      }
    } catch (err) {
      console.error('[DangerZone] recover data failed:', err)
      setRecoverRecruitStatus({ success: false, message: 'Recovery failed: ' + (err?.message || 'unknown error') })
    }
  }

  // ─── Restore from Backup File ────────────────────────────────────────
  // The companion to "Download Backup" above: takes that same JSON file
  // back and merges it INTO this live dynasty (unlike Import Dynasty
  // elsewhere in the app, which always creates a separate, new dynasty).
  // Additive only, same as Recover Data above — fills in anything this
  // dynasty is missing (players, games, and their attached recaps/socials/
  // score graphics, plus season honors), never touches anything already here.
  const handleRestoreFileChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file next time
    if (!file) return
    const ok = await confirm({
      title: 'Restore from backup?',
      message: `This reads "${file.name}" and fills in any players, games, or other data this dynasty is currently missing. It only ADDS data — nothing already here is deleted or overwritten. Continue?`,
      confirmLabel: 'Restore',
      variant: 'primary',
    })
    if (!ok) return
    setRestoreFileStatus('running')
    try {
      const result = await restoreDynastyFromBackup(currentDynasty.id, file)
      if (!result?.success) {
        setRestoreFileStatus({ success: false, message: result?.error || 'Restore failed.' })
        return
      }
      if (result.message) {
        setRestoreFileStatus({ success: true, message: result.message })
        return
      }
      const parts = []
      if (result.playersAdded) parts.push(`${result.playersAdded} player(s)`)
      if (result.gamesAdded) parts.push(`${result.gamesAdded} game(s)`)
      if (result.extraFieldsFilled) parts.push(`${result.extraFieldsFilled} other record(s) (recaps/socials/honors)`)
      setRestoreFileStatus({
        success: true,
        message: `Restored: ${parts.join(', ')}. Reload the page to see everything.`,
      })
    } catch (err) {
      console.error('[DangerZone] restore from backup failed:', err)
      setRestoreFileStatus({ success: false, message: 'Restore failed: ' + (err?.message || 'unknown error') })
    }
  }

  // Wipe the user team's CURRENT-year roster so a fresh roster can be imported.
  // Roster import always MERGES (it never deletes players missing from the
  // sheet), so re-importing a corrected roster leaves the old names behind.
  // This removes every player on the user team's current roster (same filter as
  // the Roster page). Other teams' players and honor-only entries are untouched.
  // The Enter Roster task stays reachable via its Edit button to re-import.
  const handleClearRoster = async () => {
    const players = currentDynasty?.players || []
    const currentYear = currentDynasty?.currentYear || new Date().getFullYear()
    const userTid = currentDynasty?.currentTid

    const removePids = new Set(
      players
        .filter(p => !p.isHonorOnly && isPlayerOnRoster(p, userTid, currentYear, currentDynasty))
        .map(p => p.pid)
    )

    if (removePids.size === 0) {
      setClearRosterStatus({ success: true, message: 'Your team has no players on the current roster — nothing to clear.' })
      return
    }

    const ok = await confirm({
      title: `Clear your team's roster?`,
      message: `This permanently deletes the ${removePids.size} player(s) on your current roster (${currentYear}) so you can re-import a fresh one. Other teams' rosters are untouched. This cannot be undone.`,
      confirmLabel: 'Clear Roster',
      variant: 'danger',
    })
    if (!ok) return

    setClearRosterStatus('running')
    try {
      const remaining = players.filter(p => !removePids.has(p.pid))
      await updateDynasty(currentDynasty.id, { players: remaining })
      setClearRosterStatus({ success: true, message: `Cleared ${removePids.size} player(s). Re-import via the Enter Roster task (use its Edit button).` })
    } catch (error) {
      setClearRosterStatus({ success: false, message: 'Clear failed: ' + error.message })
    }
  }

  // Wipes EVERYTHING the CFB27 save-sync pipeline has ever written to this
  // dynasty, back to a pre-sync state — recovery tool for when the WRONG
  // save file got uploaded (a different dynasty's own save, not a newer
  // version of this same one) and contaminated players/games/records/season
  // state with a completely different simulated universe's data. A normal
  // re-sync with the correct file can't undo this on its own: (1) sync is a
  // merge/upsert, it never deletes stale records the new file doesn't
  // mention, and (2) computeCfb27SyncSeasonAdvance explicitly refuses to
  // rewind currentWeek/currentPhase backward if the correct save's real
  // season point is EARLIER than what's already stored (e.g. stuck at Bowl
  // Week 1 when the real save is still Preseason) — so week/phase must be
  // reset here too, or even a correct re-sync can never move it back.
  // Deliberately leaves alone: team identity (abbr/name/colors/conference),
  // rivalries (gap-fill only, safe either way, and holds the user's own
  // trophy customization), teamFuture (Scheme Builder depth-chart/package
  // customization), and memberPhotos (tied to the user's profile, not a
  // season).
  const handleResetCfb27SyncData = async () => {
    const ok = await confirm({
      title: 'Reset all CFB27 sync data?',
      message: `This wipes EVERYTHING the CFB27 save sync has ever written to this dynasty, for every year: every player, every game, team ratings/rankings/coaching staff/school grades/recruiting classes, Players of the Week, Heisman Watch, All-Americans/All-Conference, named awards, CFP seeds, NFL draft results, the Coach Carousel job-offer list, Players Leaving, and the current week/phase (reset to Preseason Wk 0). Your next "Advance Week" rebuilds everything fresh from whatever save you upload. Use this to recover from accidentally syncing the wrong dynasty's save file. This cannot be undone.`,
      confirmLabel: 'Reset Sync Data',
      variant: 'danger',
    })
    if (!ok) return

    setResetCfb27Status('running')
    try {
      const teams = currentDynasty?.teams || {}
      const clearedTeams = {}
      for (const [tid, team] of Object.entries(teams)) {
        clearedTeams[tid] = {
          ...team,
          byYear: {},
          pendingUserId: null,
          coachPosition: team.userId ? team.coachPosition : null,
        }
      }

      await updateDynasty(currentDynasty.id, {
        players: [],
        games: [],
        teams: clearedTeams,
        currentWeek: 0,
        currentPhase: 'preseason',
        playersOfWeekByYear: {},
        heismanWatchByYear: {},
        allAmericansByYear: {},
        awardsByYear: {},
        cfpSeedsByYear: {},
        cfpSeedsByYearTid: {},
        cfpBowlConfigByYear: {},
        draftResultsByTeamYear: {},
        coachOffers: [],
        newJobData: null,
        playersLeavingByYear: {},
        playersLeavingByTeamYear: {},
      })
      setResetCfb27Status({ success: true, message: 'All CFB27 sync data cleared. Use "Advance Week" with the correct save file to rebuild.' })
    } catch (error) {
      setResetCfb27Status({ success: false, message: 'Reset failed: ' + error.message })
    }
  }

  // Recovery for a specific bug: syncing from a save whose schedule hasn't
  // been generated yet (e.g. Preseason Wk 0, before the game itself has
  // assigned matchups) makes the sync see "0 games this year" and delete
  // every real game record for that team/year — computeScheduleDiff can't
  // tell "genuinely empty" apart from "nothing to compare against yet".
  // teams[tid].byYear[year].schedule (the denormalized copy the Dashboard's
  // schedule panel reads) isn't touched by that bug, so it still holds the
  // real week/opponent list even after dynasty.games gets wiped. This
  // re-runs that same schedule through computeScheduleDiff/applyScheduleDiff
  // as if it were freshly synced, recreating the missing game records
  // without needing to wait for the save to regenerate anything.
  // A game synced BEFORE the FCS tid fix (2026-07-25) cached its generic FCS
  // opponent with no opponentTid at all — a real game record built from that
  // has no team2Tid, which every downstream tid-based lookup (Team View's
  // schedule rows included) can't resolve, so the row disappears entirely
  // instead of just showing a bad logo. The cached string could be ANY of
  // several historical formats depending on exactly when this dynasty last
  // synced (plain raw name "FCS Midwest", 4-letter abbr "FCSM", or 5-letter
  // abbr "FCSMW") — matched by region name via regex instead of an exact
  // abbr list so it can't miss regardless of which format got cached.
  // Checked most-specific-first (Southeast/Northwest/Midwest before
  // East/West) since "East"/"West" are substrings of the compound region
  // names.
  const FCS_REGION_PATTERNS = [
    { tid: 141, re: /fcs\s*se\b|fcs\s*south\s*east/i },
    { tid: 139, re: /fcs\s*nw?\b|fcs\s*north\s*west/i },
    { tid: 138, re: /fcs\s*mw?\b|fcs\s*mid\s*west/i },
    { tid: 137, re: /fcs\s*e\b|fcs\s*east/i },
    { tid: 140, re: /fcs\s*w\b|fcs\s*west/i },
  ]
  const repairLegacyFCSEntries = (schedule) => schedule.map(entry => {
    if (entry.opponentTid || !entry.opponent) return entry
    const opponentStr = String(entry.opponent)
    const match = FCS_REGION_PATTERNS.find(p => p.re.test(opponentStr))
    if (!match) return entry
    const realAbbr = TEAMS[match.tid]?.abbr || entry.opponent
    return { ...entry, opponentTid: match.tid, opponent: realAbbr }
  })

  const handleRebuildGamesFromSchedule = async () => {
    if (!currentDynasty?.currentTid) return
    const tid = currentDynasty.currentTid
    const year = currentDynasty.currentYear
    const schedule = repairLegacyFCSEntries(getScheduleForTeam(currentDynasty, tid, year))

    const ok = await confirm({
      title: 'Rebuild games from cached schedule?',
      message: `Recreates ${year}'s game records for your team from the schedule already cached on the Dashboard (${schedule.filter(e => !e.isBye).length} games) — use this if Team View's Schedule tab shows "No Schedule" even though the Dashboard still shows your real schedule. Any already-played games/scores for weeks NOT in dynasty.games right now will need to be re-entered manually (this only rebuilds the matchup shells, not past scores). This does not affect any other data.`,
      confirmLabel: 'Rebuild Games',
      variant: 'danger',
    })
    if (!ok) return

    setRebuildGamesStatus('running')
    try {
      if (!schedule.length) {
        setRebuildGamesStatus({ success: false, message: 'No cached schedule found for this team/year — there is nothing to rebuild from.' })
        return
      }
      const existingGames = currentDynasty.games || []
      const diff = computeScheduleDiff(currentDynasty, schedule, tid, year)
      const mergedGames = applyScheduleDiff(existingGames, diff)

      // Also write the repaired (real-tid) schedule back into the cache
      // itself — the Dashboard's schedule panel reads
      // teams[tid].byYear[year].schedule directly, NOT dynasty.games, so
      // only fixing dynasty.games (as this tool originally did) left the
      // Dashboard still showing the stale, un-repaired FCS entry even after
      // Team View's schedule tab started rendering correctly from the fixed
      // game records.
      const existingTeam = currentDynasty.teams?.[tid]
      const teamsUpdate = existingTeam
        ? {
            teams: {
              ...currentDynasty.teams,
              [tid]: {
                ...existingTeam,
                byYear: {
                  ...existingTeam.byYear,
                  [year]: { ...(existingTeam.byYear?.[year] || {}), schedule: diff.updatedSchedule },
                },
              },
            },
          }
        : {}

      await updateDynasty(currentDynasty.id, { games: mergedGames, ...teamsUpdate })
      setRebuildGamesStatus({ success: true, message: `Rebuilt ${diff.toAdd.length} game(s), updated ${diff.toUpdate.length}, kept ${diff.toKeep.length} already correct. Dashboard's cached schedule was refreshed too.` })
    } catch (error) {
      setRebuildGamesStatus({ success: false, message: 'Rebuild failed: ' + error.message })
    }
  }

  // Re-align an entire dynasty to the NCAA 11 (2010-era) conference layout and
  // add the Idaho Vandals to the WAC. Writes the alignment directly into the
  // dynasty's bulk conference store (customConferencesByYear) so it bypasses
  // the Conference Realignment modal's "place every team" requirement. Best
  // run on a brand-new dynasty before games are entered.
  const handleMigrateToNCAA11 = async () => {
    if (!currentDynasty) return
    const startYear = Number(currentDynasty.startYear) || 2024
    const currentYear = Number(currentDynasty.currentYear) || startYear

    const ok = await confirm({
      title: 'Migrate this dynasty to NCAA 11?',
      message: `Re-aligns every conference to the 2010 NCAA 11 layout (revives the Big East and WAC, restores the old Big 12 / Pac-12 / Mountain West) and adds the Idaho Vandals to the WAC.${playAsIdaho ? ' Your controlled team is switched to the Idaho Vandals.' : ''} It also clears ${playAsIdaho ? "the auto-seeded roster" : "your team's auto-seeded roster"} so you can import a fresh roster from the old game. Best run on a brand-new dynasty before entering games. Programs that were not FBS in 2010 (App State, Delaware, Charlotte, UTSA, etc.) are removed from the dynasty entirely. This cannot be undone automatically.`,
      confirmLabel: 'Migrate to NCAA 11',
      variant: 'danger',
    })
    if (!ok) return

    setNcaa11Status('running')
    try {
      const teams = { ...(currentDynasty.teams || {}) }

      // 1. Inject Idaho if it isn't already present (match by abbr).
      let idahoTid = Object.keys(teams).find(tid => teams[tid]?.abbr === IDAHO_TEAM.abbr)
      if (!idahoTid) {
        const maxTid = Object.keys(teams).reduce((m, tid) => Math.max(m, Number(tid) || 0), 0)
        idahoTid = String(Math.max(maxTid + 1, 142))
        teams[idahoTid] = {
          ...IDAHO_TEAM,
          tid: Number(idahoTid),
          byYear: {},
          isCustom: true,
        }
      }
      idahoTid = String(idahoTid)

      // Determine the controlled team up front so we never delete it.
      const oldUserTid = getUserTeamTid(currentDynasty)
      const oldPosition = (oldUserTid && teams[oldUserTid]?.coachPosition)
        || currentDynasty.coachPosition || 'HC'
      const controlledTid = playAsIdaho ? idahoTid : (oldUserTid != null ? String(oldUserTid) : null)

      // 2. Remove every FBS program that wasn't in NCAA 11 (App State,
      //    Charlotte, UTSA, Delaware, etc.) from the dynasty entirely. Because
      //    every team list in the app derives from dynasty.teams, deleting the
      //    slots hides them everywhere — Teams page, schedule/opponent pickers,
      //    standings, recruiting. FCS generics (137-141) stay for scheduling,
      //    and the user's controlled team is never removed even if it isn't an
      //    NCAA 11 program.
      const placedAbbrs = new Set(Object.values(NCAA11_CONFERENCES).flat())
      const removedAbbrs = new Set()
      for (const tid of Object.keys(teams)) {
        const t = teams[tid]
        if (t?.isFCS || !t?.abbr) continue
        if (placedAbbrs.has(t.abbr)) continue
        if (String(tid) === String(controlledTid)) continue
        removedAbbrs.add(t.abbr)
        delete teams[tid]
      }

      // 3. Build the conference snapshot and apply it from startYear →
      //    currentYear so the base map covers the whole dynasty regardless of
      //    where getCustomConferencesForYear's walk-back lands. Any pre-existing
      //    (modern) yearly snapshots are overwritten.
      const snapshot = {}
      for (const [conf, abbrs] of Object.entries(NCAA11_CONFERENCES)) {
        snapshot[conf] = [...abbrs]
      }
      const customConferencesByYear = { ...(currentDynasty.customConferencesByYear || {}) }
      for (const y of Object.keys(customConferencesByYear)) {
        customConferencesByYear[y] = snapshot
      }
      for (let y = startYear; y <= currentYear; y++) {
        customConferencesByYear[y] = snapshot
      }

      // 4. Belt-and-suspenders: set each placed team's top-level conference so
      //    the per-team overlay agrees with the bulk map (Idaho included).
      const abbrToConf = {}
      for (const [conf, abbrs] of Object.entries(NCAA11_CONFERENCES)) {
        for (const a of abbrs) abbrToConf[a] = conf
      }
      for (const tid of Object.keys(teams)) {
        const conf = abbrToConf[teams[tid]?.abbr]
        if (conf) teams[tid] = { ...teams[tid], conference: conf }
      }

      const updates = { teams, customConferencesByYear }

      // Clear the auto-seeded roster on the team we're leaving (or keeping, if
      // not switching) so a fresh NCAA 11 roster can be imported without the
      // default roster repopulating, and drop anyone on a team that no longer
      // exists. Honor-only players are preserved.
      const players = currentDynasty.players || []
      if (players.length > 0) {
        const remaining = players.filter(p => {
          if (p.isHonorOnly) return true
          if (oldUserTid != null && isPlayerOnRoster(p, oldUserTid, currentYear, currentDynasty)) return false
          if (p.team && removedAbbrs.has(p.team)) return false
          return true
        })
        if (remaining.length !== players.length) updates.players = remaining
      }

      if (playAsIdaho) {
        // Move the userId flag off every other slot and onto Idaho.
        for (const tid of Object.keys(teams)) {
          if (teams[tid]?.userId === 'currentUser' && tid !== idahoTid) {
            const { userId, ...rest } = teams[tid]
            teams[tid] = rest
          }
        }
        teams[idahoTid] = { ...teams[idahoTid], userId: 'currentUser', coachPosition: oldPosition }

        updates.currentTid = Number(idahoTid)
        updates.teamName = IDAHO_TEAM.name
        updates.coachTeamByYear = {
          ...(currentDynasty.coachTeamByYear || {}),
          [currentYear]: { tid: Number(idahoTid), team: IDAHO_TEAM.abbr, teamName: IDAHO_TEAM.name },
        }
        updates.coachCareer = addCareerEntry(currentDynasty.coachCareer || [], currentYear, Number(idahoTid), oldPosition)

        if (user?.uid) {
          updates.memberTeams = { ...(currentDynasty.memberTeams || {}), [user.uid]: [Number(idahoTid)] }
          updates.memberTeamHistory = {
            ...(currentDynasty.memberTeamHistory || {}),
            [user.uid]: {
              ...((currentDynasty.memberTeamHistory || {})[user.uid] || {}),
              [currentYear]: [Number(idahoTid)],
            },
          }
        }
      }

      // Keep dynasty.conference in sync with the controlled team's new league.
      const controlledConf = controlledTid && abbrToConf[teams[controlledTid]?.abbr]
      if (controlledConf) updates.conference = controlledConf

      // replaceTeams: deleting the non-NCAA-11 slots only sticks if local state
      // replaces the teams map wholesale — deepMerge alone can't drop keys.
      await updateDynasty(currentDynasty.id, updates, { replaceTeams: true })

      setNcaa11Status({
        success: true,
        message: playAsIdaho
          ? 'Migrated to NCAA 11. You are now the Idaho Vandals (WAC). Reload to see the new conferences.'
          : 'Migrated to NCAA 11 alignment. Idaho added to the WAC. Open the Teams page to see the new conferences.',
      })
    } catch (error) {
      setNcaa11Status({ success: false, message: 'Migration failed: ' + error.message })
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
      // For cloud dynasties, read games DIRECTLY from the Firestore server so
      // we never miss a duplicate that's in Firestore but not in stale React
      // state. This is exactly the class of bug that creates duplicates: a
      // save committed to Firestore but a background stale-read reverted the
      // React state, so one of the two copies isn't visible locally.
      let games = currentDynasty.games || []
      const looksLikeCloud = typeof currentDynasty?.id === 'string' &&
        currentDynasty.id.length >= 20 && !/^\d+$/.test(currentDynasty.id)
      if (looksLikeCloud) {
        try {
          const gamesRef = collection(db, 'dynasties', currentDynasty.id, 'games')
          const snap = await getDocsFromServer(gamesRef)
          if (!snap.empty) {
            games = snap.docs.map(d => ({ ...d.data(), id: d.id }))
            console.log(`[DuplicateCleanup] Read ${games.length} games fresh from Firestore server`)
          }
        } catch (serverReadErr) {
          console.warn('[DuplicateCleanup] Server read failed, falling back to React state:', serverReadErr)
        }
      }
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
        source: g.source,
        hasBoxScore: !!(g.boxScore && Object.keys(g.boxScore).length > 0),
        team1Score: g.team1Score,
        team2Score: g.team2Score,
        updatedAt: g.updatedAt,
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
        // Prefer manually-entered games over auto-imported weekly-scores rows.
        // When a user corrects a weekly-scores entry via addGame, we want
        // to keep their manual edit (the more intentional record), not the
        // auto-import. Use updatedAt as tiebreaker so the most recent save wins.
        if (game.source !== 'weekly-scores') score += 3
        // Fractional tiebreaker from updatedAt so the most recently saved record wins
        // on equal quality (safe: always < 1, so can't flip the primary categories)
        if (game.updatedAt || game.createdAt) {
          const ts = new Date(game.updatedAt || game.createdAt).getTime()
          if (!isNaN(ts)) score += Math.min(ts / 1e15, 0.9)
        }
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

      // Use targeted delete (saveWeeklyGamesChanges with empty inserts + duplicate IDs
      // to delete) rather than a full-array updateDynasty rewrite.  The full-rewrite
      // path uses saveGamesToSubcollection with deleteOrphans=true, which has a 30%
      // safety block that fires on large dynasties and silently skips the deletion.
      // Targeted delete bypasses that check because we're only removing known bad docs.
      if (looksLikeCloud) {
        await saveWeeklyGamesChanges(currentDynasty.id, [], duplicateIds)
        // Sync React state to match what we just deleted from Firestore.
        const cleanedGames = games.filter(g => !duplicateIds.includes(g.id))
        await updateDynasty(currentDynasty.id, { games: cleanedGames }, { skipGamesSubcollection: true })
      } else {
        const cleanedGames = games.filter(g => !duplicateIds.includes(g.id))
        await updateDynasty(currentDynasty.id, { games: cleanedGames })
      }
      setDuplicateGameCleanupStatus({ success: true, message: `Removed ${duplicateIds.length} duplicate(s)` })
    } catch (error) {
      setDuplicateGameCleanupStatus({ success: false, message: 'Cleanup failed: ' + error.message })
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
      // String-coerce BOTH sides. gameId arrives from a <select>, whose value
      // is always a string, while a legacy game.id may be a number — a raw
      // !== between the two is always true, so the filter removed nothing and
      // the success message below fired anyway. Silent no-op, which reads to
      // the user as "the delete button does nothing." Matches the context's
      // deleteGame, which already compares this way.
      const cleanedGames = games.filter(g => String(g.id) !== String(gameId))
      if (cleanedGames.length === games.length) {
        setGameDeletionStatus({ success: false, message: 'That game was not found — nothing was deleted.' })
        return
      }
      await updateDynasty(currentDynasty.id, { games: cleanedGames })
      setGameDeletionStatus({ success: true, message: 'Game deleted successfully' })
      setSelectedGameToDelete(null)
    } catch (error) {
      setGameDeletionStatus({ success: false, message: 'Delete failed: ' + error.message })
    }
  }

  // Swap which team owns the box-score stats for a specific game
  const handleSwapBoxScoreTeams = async (gameId) => {
    if (!gameId) return
    const game = (currentDynasty.games || []).find(g => g.id === gameId)
    if (!game) return
    const ok = await confirm({
      title: 'Swap box score teams?',
      message: `Each team's stats will move under the other team's header. Click Swap again later to revert.`,
      confirmLabel: 'Swap',
      variant: 'danger',
    })
    if (!ok) return
    setBoxScoreSwapStatus('running')
    try {
      const next = swapBoxScoreTeams(game, currentDynasty?.teams)
      next.statsContributed = null
      await addGame(currentDynasty.id, next)
      setBoxScoreSwapStatus({ success: true, message: 'Box score teams swapped.' })
    } catch (error) {
      setBoxScoreSwapStatus({ success: false, message: 'Swap failed: ' + error.message })
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
            // A CFP game is never also a plain bowl. Demoted games (edited
            // through the Game Editor without the CFP bowl-name marker) carry
            // isBowlGame=true, which makes them render as regular-season bowls
            // even after the CFP flag is restored. Clear it.
            if (updatedGame.isBowlGame) {
              console.log(`[CFP Repair] Clearing isBowlGame for ${game.id}`)
              updatedGame.isBowlGame = false
              gameModified = true
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
    // tid-first: a stored team1/team2 string can be stale after a rename or
    // TeamBuilder takeover, so resolve the CURRENT abbr from teams[tid] when a
    // tid is present. Keep the stored string + original-registry abbr as
    // fallbacks so behavior is identical when no tid exists.
    const direct = side === 1 ? game.team1 : game.team2
    const tid = side === 1 ? game.team1Tid : game.team2Tid
    if (tid != null) {
      const team = currentDynasty?.teams?.[tid] || TEAMS[tid]
      return team?.abbr || direct || getOriginalTeamAbbr(tid)
    }
    return direct || (side === 1 ? game.userTeam : game.opponent)
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
      // Keep a visible status by the button too — the review panel is at the
      // bottom of the page, and clearing the status here made a successful
      // detection indistinguishable from a silent failure.
      setDuplicateMergeStatus({ success: true, message: `Found ${groups.length} possible duplicate group${groups.length === 1 ? '' : 's'} — review below to merge.` })
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
  const ActionCard = ({ title, description, buttonText, onClick, status, variant = 'primary', danger = false, pcOnly = false }) => {
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
       
      >
        <div className="mb-3">
          {(danger || pcOnly) && (
            <div className="flex items-center gap-2 mb-1.5">
              {danger && (
                <span className="label-xs" style={{ color: 'var(--accent-error)', letterSpacing: '1.5px' }}>
                  USE WITH CAUTION
                </span>
              )}
              {pcOnly && (
                <span
                  className="label-xs px-1.5 py-0.5 rounded"
                  style={{ color: 'var(--accent-info, #60a5fa)', border: '1px solid currentColor', letterSpacing: '1px' }}
                >
                  PC ONLY
                </span>
              )}
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

      {/* Local Backups — recover a local dynasty after a bad write or a
          browser clearing its site data. Non-destructive (restore merges). */}
      <Card>
        <div className="flex items-center justify-between mb-2">
          <h3 className="label-sm text-txt-primary m-0">Local Backups</h3>
          <Button variant="outline" size="sm" onClick={loadLocalBackups}>
            {localBackups === null ? 'Show Backups' : 'Refresh'}
          </Button>
        </div>
        <p className="text-xs text-txt-secondary m-0 mb-3">
          Automatic snapshots of your locally-stored dynasties, kept in this browser.
          If a dynasty disappeared, restore the most recent snapshot. Restoring only
          adds/repairs dynasties — it never deletes ones you made since.
        </p>
        {localBackups !== null && (
          localBackups.length === 0 ? (
            <p className="text-xs text-txt-tertiary m-0">No local backups found in this browser.</p>
          ) : (
            <div className="space-y-2">
              {localBackups.map((b) => (
                <div key={b.ts} className="flex items-center justify-between gap-3 p-2 rounded-lg" style={{ backgroundColor: 'var(--surface-3)' }}>
                  <div className="text-xs text-txt-secondary min-w-0">
                    <span className="text-txt-primary">{new Date(b.ts).toLocaleString()}</span>
                    <span className="text-txt-tertiary"> · {(b.dynasties?.length || 0)} dynasty(ies): </span>
                    <span className="truncate">{(b.dynasties || []).map(d => d.name).filter(Boolean).join(', ') || '—'}</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => handleRestoreBackup(b.ts, b.dynasties?.length || 0)} disabled={backupStatus === 'running'}>
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          )
        )}
        {backupStatus && backupStatus !== 'running' && (
          <p className="text-xs mt-3 m-0" style={{ color: backupStatus.success ? 'var(--accent-success)' : 'var(--accent-danger, #f87171)' }}>
            {backupStatus.message}
          </p>
        )}
      </Card>

      {/* Recover Data from Another Save — copy the roster + Recruiting Database
          + committed recruits from another of the user's saves into this one.
          Additive only. Built for "switched local→cloud, roster/recruits empty". */}
      <Card>
        <h3 className="label-sm text-txt-primary m-0 mb-3">Recover Data from Another Save</h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={recoverRecruitSourceId}
            onChange={(e) => setRecoverRecruitSourceId(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg text-sm bg-surface-3 text-txt-primary border border-surface-5"
          >
            <option value="">Copy data from…</option>
            {(dynasties || [])
              .filter(d => String(d.id) !== String(currentDynasty?.id))
              .map(d => (
                <option key={d.id} value={d.id}>
                  {(d.name || d.teamName || 'Dynasty')} · {d.storageType === 'cloud' ? 'Cloud' : 'Local'}
                </option>
              ))}
          </select>
          <Button
            variant="outline"
            onClick={handleRecoverRecruits}
            disabled={recoverRecruitStatus === 'running' || !recoverRecruitSourceId}
          >
            {recoverRecruitStatus === 'running' ? 'Recovering…' : 'Recover Data'}
          </Button>
        </div>
        {recoverRecruitStatus && recoverRecruitStatus !== 'running' && (
          <p className="text-xs mt-3 m-0" style={{ color: recoverRecruitStatus.success ? 'var(--accent-success)' : 'var(--accent-danger, #f87171)' }}>
            {recoverRecruitStatus.message}
          </p>
        )}
      </Card>

      {/* Help Section (Collapsible) */}
      {showHelp && (
        <Card>
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
      <Card>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-txt-secondary m-0">
            <strong style={{ color: 'var(--accent-warning)' }}>Back up first.</strong> Download a backup before making changes.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={restoreFileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleRestoreFileChange}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => restoreFileInputRef.current?.click()}
              disabled={restoreFileStatus === 'running'}
            >
              {restoreFileStatus === 'running' ? 'Restoring…' : 'Restore from Backup'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => exportDynasty && exportDynasty(dynastyId)}
            >
              Download Backup
            </Button>
          </div>
        </div>
        {restoreFileStatus && restoreFileStatus !== 'running' && (
          <p className="text-xs mt-3 mb-0" style={{ color: restoreFileStatus.success ? 'var(--accent-success)' : 'var(--accent-danger, #f87171)' }}>
            {restoreFileStatus.message}
          </p>
        )}
      </Card>

      {/* Game Edition — switch which edition this dynasty is tracked as.
          Safe + reversible: only changes which features/rules apply (e.g.
          CFB 27 Dynasty Points), never the underlying players/games/stats.
          Lives here so a mis-pick at creation can be corrected. */}
      {!isViewOnly && (
        <div>
          <SectionHeader
            size="sm"
            title="Game Edition"
            subtitle="Switch the edition this dynasty is tracked as. Reversible; does not change your data."
          />
          <Card>
            {(() => {
              const currentKey = getEditionKey(currentDynasty)
              return (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs text-txt-secondary m-0">
                    Currently tracked as{' '}
                    <strong className="text-txt-primary">{getEditionConfig(currentKey)?.label}</strong>.
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {EDITIONS.map((ed) => {
                      const active = ed.key === currentKey
                      return (
                        <Button
                          key={ed.key}
                          variant={active ? 'primary' : 'outline'}
                          size="sm"
                          disabled={active || switchingEdition}
                          onClick={() => handleSwitchEdition(ed.key)}
                        >
                          {active ? `${ed.label} (current)` : `Switch to ${ed.label}`}
                        </Button>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
          </Card>
        </div>
      )}

      {/* Coaching Staff — build cid coach profiles from legacy coordinator
          names so they get coach pages + year-by-year history. CFB 27 only. */}
      {!isViewOnly && getEditionConfig(currentDynasty)?.features?.dynastyPoints && (
        <div>
          <SectionHeader
            size="sm"
            title="Coaching Staff"
            subtitle="Build coach profiles from your recorded coordinators."
          />
          <Card>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-txt-secondary m-0 max-w-md">
                Creates a coach profile — with year-by-year team &amp; role history — for every OC/DC name recorded across your seasons, so each gets a coach page. Salaries weren’t tracked historically, so they start blank; add them on each coach’s page. Safe to re-run.
              </p>
              <Button
                variant="primary"
                size="sm"
                onClick={handleMigrateCoaches}
                disabled={coachMigrateStatus === 'running'}
              >
                {coachMigrateStatus === 'running' ? 'Building…' : 'Build Coach Profiles'}
              </Button>
            </div>
            <StatusLine status={coachMigrateStatus} />
          </Card>
        </div>
      )}

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
            title="Remove Duplicates"
            description="Fixes duplicate games causing wrong records"
            buttonText="Remove"
            onClick={handleDuplicateGameCleanup}
            status={duplicateGameCleanupStatus}
          />
          <ActionCard
            title="Merge Duplicate Players"
            description="Finds players with same name and merges their stats/history"
            buttonText="Merge Players"
            onClick={handleDetectDuplicates}
            status={duplicateMergeStatus}
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
          {/* Recruiting-commitment consistency check + re-sync. Read-only scan
              that flags any team-year where the two dual-keyed commitment stores
              disagree; re-sync rewrites the per-record union to both. */}
          <Card className="flex flex-col h-full sm:col-span-2 md:col-span-2">
            <div className="mb-3">
              <h3 className="label-sm text-txt-primary m-0">Check Recruiting Commitments</h3>
              <p className="text-xs mt-1 text-txt-tertiary leading-relaxed m-0">
                Recruiting commitments are stored in two places that should mirror each other. This flags any season where they disagree. No data is ever lost (the board reads both), but re-syncing keeps them tidy. Run this if commitments ever look off after entering recruits.
              </p>
            </div>
            <div className="mt-auto space-y-2">
              <Button
                variant="primary"
                size="sm"
                onClick={handleCheckCommitments}
                disabled={commitCheckStatus === 'running'}
                className="w-full"
              >
                {commitCheckStatus === 'running' ? 'Working...' : 'Check Commitments'}
              </Button>
              {!isViewOnly && commitDrifted?.length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleResyncCommitments}
                  disabled={commitCheckStatus === 'running'}
                  className="w-full"
                >
                  Re-sync {commitDrifted.length} season{commitDrifted.length === 1 ? '' : 's'}
                </Button>
              )}
              <StatusLine status={commitCheckStatus} />
              {commitCheckDetail && (
                <pre
                  className="text-[11px] mt-2 p-3 rounded-md overflow-auto whitespace-pre font-mono"
                  style={{
                    backgroundColor: 'var(--surface-3)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--surface-4)',
                    maxHeight: '320px',
                  }}
                >
                  {commitCheckDetail}
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
        <div ref={duplicatePanelRef} style={{ scrollMarginTop: '5rem' }}>
        <Card>
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
        </div>
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

      {/* Swap Box Score Teams */}
      <div>
        <SectionHeader
         
          size="sm"
          title="Swap Box Score Teams"
          subtitle="Fix a game where each team's stats are showing under the wrong team"
        />
        <Card>
          {!showBoxScoreSwap ? (
            <Button variant="outline" onClick={() => setShowBoxScoreSwap(true)}>
              Show Games
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-txt-secondary m-0">Select a game to swap box score teams. You can paste a Game ID from the bottom of the game editor, or pick from the list.</p>
                <Button variant="ghost" size="sm" onClick={() => { setShowBoxScoreSwap(false); setSelectedGameToSwap(null); setBoxScoreSwapStatus(null) }}>
                  Hide
                </Button>
              </div>

              <Input
                placeholder="Paste Game ID (e.g. game-1234567890)"
                value={selectedGameToSwap || ''}
                onChange={(e) => { setSelectedGameToSwap(e.target.value); setBoxScoreSwapStatus(null) }}
              />

              <Select
                value={selectedGameToSwap || ''}
                onChange={(e) => { setSelectedGameToSwap(e.target.value); setBoxScoreSwapStatus(null) }}
              >
                <option value="">— or pick from list —</option>
                {(currentDynasty.games || [])
                  .filter(g => hasAnyPlayerStats(g, currentDynasty?.teams) || hasAnyTeamStats(g, currentDynasty?.teams))
                  .sort((a, b) => {
                    if (b.year !== a.year) return (b.year || 0) - (a.year || 0)
                    const weekA = typeof a.week === 'number' ? a.week : 99
                    const weekB = typeof b.week === 'number' ? b.week : 99
                    return weekA - weekB
                  })
                  .map(game => {
                    const info = getGameDisplayInfo(game)
                    return (
                      <option key={game.id} value={game.id}>
                        {info.year} Wk{info.week} - {info.team1Name} vs {info.team2Name} ({info.score}) [{game.id}]
                      </option>
                    )
                  })}
              </Select>

              {selectedGameToSwap && (
                <div className="flex items-center gap-3 flex-wrap">
                  <Button variant="danger" onClick={() => handleSwapBoxScoreTeams(selectedGameToSwap)}>
                    Swap Teams in Box Score
                  </Button>
                  {boxScoreSwapStatus && boxScoreSwapStatus !== 'running' && (
                    <span
                      className="text-sm"
                      style={{ color: boxScoreSwapStatus.success ? 'var(--accent-success)' : 'var(--accent-error)' }}
                    >
                      {boxScoreSwapStatus.message}
                    </span>
                  )}
                  {boxScoreSwapStatus === 'running' && (
                    <span className="text-sm text-txt-tertiary">Swapping…</span>
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
          subtitle="Known to corrupt records on dynasties started on older builds. Back up first."
        />
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {/* Console-only repair tools — every one below fixes a failure mode
              specific to manual data entry or the local advanceWeek/import
              logic. None of that applies to a PC dynasty, whose roster,
              transfers, classes, and CFP data all come straight from the
              save every sync — running one of these would either do nothing
              (get overwritten by the next sync) or actively corrupt data the
              next sync would otherwise have kept correct. See isPc's own
              comment above. */}
          {!isPc && (<>
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
            title="Rebuild Roster Carryover"
            description="Fixes a season whose roster came up empty after advancing. Re-derives missing season-to-season carryover: for each of your (and members') teams, any player who was on the roster the prior year, hasn't graduated, and hasn't transferred/left is carried forward into the missing year with their class aged. Only adds missing years — never overwrites, and won't bring back players who truly departed. Reload after running."
            buttonText="Rebuild Carryover"
            onClick={handleRebuildCarryover}
            status={rebuildCarryoverStatus}
          />
          <ActionCard
            danger
            title="Remove Returned Departures"
            description="Fixes rosters where graduated/drafted/transferred-out players came back after advancing to a new season. Removes the roster years a departed player wrongly regained (and the class/OVR entries added with them). Players who genuinely returned via a recorded recommit or transfer-in are kept. Reload after running."
            buttonText="Remove Ghost Years"
            onClick={handleRemoveResurrected}
            status={removeResurrectedStatus}
          />
          <ActionCard
            danger
            title="Fix Transfer Years"
            description="Backfills blank transfer/arrival years. Older transfers only recorded the new team for the arrival year, leaving class / OVR / dev trait empty (the 'skipped year'). Fills each missing year from the prior year, aging the class one step."
            buttonText="Fix Transfers"
            onClick={handleFixTransferYears}
            status={transferYearFixStatus}
          />
          <ActionCard
            danger
            title="Clear Roster"
            description="Permanently deletes every player on YOUR team's current roster so you can import a fresh one. Roster import always merges (it never removes players missing from the sheet), so re-importing leaves old names behind — clear first, then re-import. Other teams' rosters are untouched."
            buttonText="Clear Roster"
            onClick={handleClearRoster}
            status={clearRosterStatus}
          />
          </>)}
          {/* PC-only — hidden for console the same way the tools above are
              hidden for PC: neither is meaningful on the other platform. */}
          {isPc && (<>
          <ActionCard
            danger
            pcOnly
            title="Reset CFB27 Sync Data"
            description="For CFB27 dynasties only: wipes every player, game, team record, and synced feature (recruiting, awards, CFP seeds, draft results, job offers) back to a pre-sync state, and resets the current week/phase. Use this if the wrong save file (a different dynasty's save) ever got uploaded via Sync from Save — a normal re-sync with the correct file can't undo that contamination on its own. Your next Sync from Save rebuilds everything fresh."
            buttonText="Reset Sync Data"
            onClick={handleResetCfb27SyncData}
            status={resetCfb27Status}
          />
          <ActionCard
            danger
            pcOnly
            title="Rebuild Games From Schedule"
            description="For CFB27 dynasties only: if Team View's Schedule tab shows 'No Schedule' even though the Dashboard still shows your real schedule, a sync from a save with no schedule generated yet (e.g. Preseason Wk 0) likely deleted your game records. This rebuilds them from the schedule still cached on the Dashboard, without needing to wait for a new save. Already-played scores for missing weeks aren't recovered — only the matchup shells."
            buttonText="Rebuild Games"
            onClick={handleRebuildGamesFromSchedule}
            status={rebuildGamesStatus}
          />
          </>)}
          {!isPc && (<>
          <Card className="flex flex-col h-full">
            <div className="mb-3">
              <h3 className="label-sm text-txt-primary m-0">Migrate to NCAA 11</h3>
              <p className="text-xs mt-1 text-txt-tertiary leading-relaxed m-0">
                Re-aligns the whole dynasty to the 2010 NCAA 11 conference layout — revives the Big East and WAC, restores the old Big 12 / Pac-12 / Mountain West, and adds the Idaho Vandals to the WAC. Also clears your team's auto-seeded roster so you can import a fresh one from the old game. Tick the box below to also take over the Idaho Vandals. Best on a brand-new dynasty before entering games. Programs that weren't FBS in 2010 (App State, Delaware, Charlotte, UTSA, etc.) are removed from the dynasty entirely.
              </p>
            </div>
            <div className="mt-auto">
              <label className="flex items-center gap-2 cursor-pointer mb-2">
                <input
                  type="checkbox"
                  checked={playAsIdaho}
                  onChange={(e) => setPlayAsIdaho(e.target.checked)}
                  className="w-3.5 h-3.5 rounded"
                  style={{ accentColor: 'var(--text-primary)' }}
                />
                <span className="text-xs text-txt-secondary">Play as the Idaho Vandals</span>
              </label>
              <Button
                variant="primary"
                size="sm"
                onClick={handleMigrateToNCAA11}
                disabled={ncaa11Status === 'running'}
                className="w-full"
              >
                {ncaa11Status === 'running' ? 'Running...' : 'Migrate to NCAA 11'}
              </Button>
              <StatusLine status={ncaa11Status} />
            </div>
          </Card>
          <ActionCard
            danger
            title="Advance Classes"
            description="Manually age up selected players. Use only when normal season advance didn't progress someone correctly — running this on already-advanced players double-progresses them."
            buttonText="Select Players"
            onClick={handleOpenAdvanceModal}
            status={advanceClassesStatus}
          />
          </>)}
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

          {/* The Migrate button must NOT require running Analyze first. The
              over-limit error banner (and the doc-too-large sync banner) both
              tell the user to "open Admin Tools and run Migrate to
              Subcollections" — a real user followed that, found only an
              Analyze button here, and reported the migrate button missing.
              For an un-migrated dynasty the migration is the remedy, not a
              detail of the size readout, so it renders unconditionally. */}
          {!sizeAnalysis && !currentDynasty._subcollectionsMigrated && (
            <div className="space-y-3">
              <p className="text-xs text-txt-tertiary leading-relaxed">
                This dynasty stores everything in a single cloud document, which
                has a hard 1MB limit. Migrating moves players, games, and other
                bulky data into their own storage with no practical limit. Safe
                to run at any time — nothing is deleted.
              </p>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubcollectionMigration}
                disabled={subcollectionMigrationStatus === 'running'}
              >
                {subcollectionMigrationStatus === 'running' ? 'Migrating...' : 'Migrate to Subcollections'}
              </Button>
              <StatusLine status={subcollectionMigrationStatus} />
            </div>
          )}

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
          <Card className="flex flex-col h-full">
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
          <Card className="flex flex-col h-full" style={{ borderLeft: '3px solid var(--accent-error)' }}>
            <div className="mb-3">
              <h3 className="label-sm text-txt-primary m-0">Clear App Storage</h3>
              <p className="text-xs mt-1 text-txt-tertiary leading-relaxed m-0">
                Deletes the local IndexedDB database. Use if you see "full disk" or storage errors preventing dynasties from loading.
              </p>
            </div>
            <div className="mt-auto">
              <Button
                variant="danger"
                size="sm"
                onClick={handleClearStorage}
                disabled={clearStorageStatus === 'running'}
                className="w-full"
              >
                {clearStorageStatus === 'running' ? 'Clearing...' : 'Clear App Storage'}
              </Button>
              <StatusLine status={clearStorageStatus} />
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
          <div className="mt-4 p-3 rounded-md text-xs" style={{ backgroundColor: 'var(--surface-3)' }}>
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

      {/* Calendar / Phase Jumper — at the very bottom. Set the dynasty to any
          season/phase/week, then open the Dashboard to see/edit that week. */}
      {!isViewOnly && (
        <div>
          <SectionHeader
            size="sm"
            title="Calendar / Phase Jumper"
            subtitle="Non-destructive preview — jump to any season/phase/week to test that point in the calendar. Nothing is saved."
          />
          <Card>
            <CalendarJumper />
          </Card>
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
