import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { useTeamColors } from '../../hooks/useTeamColors'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getContrastTextColor } from '../../utils/colorUtils'
import { getTeamName } from '../../data/teamAbbreviations'
import { TEAMS, getOriginalTeamAbbr, getTidFromAbbr } from '../../data/teamRegistry'
import TeambuilderEditModal from '../../components/TeambuilderEditModal'

export default function DangerZone() {
  const { currentDynasty, cleanupRosterData, removeOrphanedRosterEntries, migratePlayerCareerData, fixTransferredPlayers, analyzeDocumentSize, optimizeDocumentSize, migrateToSubcollections, updateDynasty, updateTeambuilderTeam, isViewOnly } = useDynasty()
  const { id: dynastyId } = useParams()
  const pathPrefix = usePathPrefix()
  const teamColors = useTeamColors(currentDynasty?.teamName, currentDynasty?.teams || currentDynasty?.customTeams)
  const primaryBgText = getContrastTextColor(teamColors.primary)
  const secondaryBgText = getContrastTextColor(teamColors.secondary)

  // Status states for each action
  const [rosterCleanupStatus, setRosterCleanupStatus] = useState(null)
  const [orphanCleanupStatus, setOrphanCleanupStatus] = useState(null)
  const [migrationStatus, setMigrationStatus] = useState(null)
  const [transferFixStatus, setTransferFixStatus] = useState(null)
  const [clearCacheStatus, setClearCacheStatus] = useState(null)
  const [recruitingSyncStatus, setRecruitingSyncStatus] = useState(null)
  const [sizeAnalysis, setSizeAnalysis] = useState(null)
  const [optimizeStatus, setOptimizeStatus] = useState(null)
  const [removeOldBoxScores, setRemoveOldBoxScores] = useState(false)
  const [subcollectionMigrationStatus, setSubcollectionMigrationStatus] = useState(null)
  const [showTeambuilderEditModal, setShowTeambuilderEditModal] = useState(false)
  const [selectedTeambuilderTid, setSelectedTeambuilderTid] = useState(null)

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

  // Handle roster cleanup
  const handleRosterCleanup = async () => {
    setRosterCleanupStatus('running')
    try {
      const result = await cleanupRosterData(currentDynasty.id)
      setRosterCleanupStatus(result)
    } catch (error) {
      console.error('Roster cleanup failed:', error)
      setRosterCleanupStatus({ success: false, message: 'Cleanup failed: ' + error.message })
    }
  }

  // Handle orphan roster entry removal
  const handleOrphanCleanup = async () => {
    setOrphanCleanupStatus('running')
    try {
      const result = await removeOrphanedRosterEntries(currentDynasty.id)
      setOrphanCleanupStatus(result)
    } catch (error) {
      console.error('Orphan cleanup failed:', error)
      setOrphanCleanupStatus({ success: false, message: 'Cleanup failed: ' + error.message })
    }
  }

  // Handle career data migration
  const handleMigration = async () => {
    setMigrationStatus('running')
    try {
      const result = await migratePlayerCareerData(currentDynasty.id)
      setMigrationStatus(result)
    } catch (error) {
      console.error('Migration failed:', error)
      setMigrationStatus({ success: false, message: 'Migration failed: ' + error.message })
    }
  }

  // Handle fix transferred players
  const handleFixTransfers = async () => {
    setTransferFixStatus('running')
    try {
      const result = await fixTransferredPlayers(currentDynasty.id)
      setTransferFixStatus(result)
    } catch (error) {
      console.error('Transfer fix failed:', error)
      setTransferFixStatus({ success: false, message: 'Fix failed: ' + error.message })
    }
  }

  // Handle clear local cache
  const handleClearCache = () => {
    setClearCacheStatus('running')
    try {
      // Clear dynasty-related localStorage items
      const keysToRemove = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && (key.includes('dynasty') || key.includes('sheet') || key.includes('token'))) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key))
      setClearCacheStatus({ success: true, message: `Cleared ${keysToRemove.length} cached items` })
    } catch (error) {
      setClearCacheStatus({ success: false, message: 'Failed to clear cache: ' + error.message })
    }
  }

  // Handle sync recruiting data from player records
  const handleSyncRecruitingData = async () => {
    setRecruitingSyncStatus('running')
    try {
      const players = currentDynasty.players || []
      const existingCommitments = currentDynasty.recruitingCommitmentsByTeamYear || {}
      let updatedCount = 0
      let addedCount = 0

      // Build updated commitments from player data
      const updatedCommitments = { ...existingCommitments }

      // Go through all players with recruitment info
      players.forEach(player => {
        if (!player.recruitYear || !player.name) return

        const recruitYear = Number(player.recruitYear)
        // Get the team they were recruited to from teamsByYear
        const enrollmentYear = recruitYear + 1
        const recruitedTeam = player.teamsByYear?.[enrollmentYear] || player.team
        if (!recruitedTeam) return

        // Initialize team/year structure if needed
        if (!updatedCommitments[recruitedTeam]) {
          updatedCommitments[recruitedTeam] = {}
        }
        if (!updatedCommitments[recruitedTeam][recruitYear]) {
          updatedCommitments[recruitedTeam][recruitYear] = {}
        }

        // Find existing commitment for this player
        let foundExisting = false
        let commitmentKey = null

        Object.entries(updatedCommitments[recruitedTeam][recruitYear]).forEach(([key, weekCommitments]) => {
          if (Array.isArray(weekCommitments)) {
            const idx = weekCommitments.findIndex(c =>
              c.name?.toLowerCase().trim() === player.name.toLowerCase().trim()
            )
            if (idx !== -1) {
              foundExisting = true
              commitmentKey = key
              // Update the commitment with player data
              // For portal transfers, use player.year as class (not 'HS')
              const isPortalPlayer = player.isPortal || !!player.previousTeam
              weekCommitments[idx] = {
                ...weekCommitments[idx],
                name: player.name,
                position: player.position,
                class: isPortalPlayer ? player.year : (weekCommitments[idx].class || 'HS'),
                devTrait: player.devTrait,
                archetype: player.archetype,
                height: player.height,
                weight: player.weight,
                hometown: player.hometown,
                state: player.state,
                stars: player.stars,
                nationalRank: player.nationalRank,
                stateRank: player.stateRank,
                positionRank: player.positionRank,
                gemBust: player.gemBust,
                previousTeam: player.previousTeam,
                isPortal: player.isPortal || !!player.previousTeam,
                pid: player.pid
              }
              updatedCount++
            }
          }
        })

        // If no existing commitment found but player has recruitment data, add to 'synced' week
        const isPortalPlayer = player.isPortal || !!player.previousTeam
        if (!foundExisting && (player.stars || player.nationalRank || isPortalPlayer)) {
          if (!updatedCommitments[recruitedTeam][recruitYear]['synced']) {
            updatedCommitments[recruitedTeam][recruitYear]['synced'] = []
          }
          updatedCommitments[recruitedTeam][recruitYear]['synced'].push({
            name: player.name,
            position: player.position,
            class: isPortalPlayer ? player.year : 'HS',
            devTrait: player.devTrait,
            archetype: player.archetype,
            height: player.height,
            weight: player.weight,
            hometown: player.hometown,
            state: player.state,
            stars: player.stars,
            nationalRank: player.nationalRank,
            stateRank: player.stateRank,
            positionRank: player.positionRank,
            gemBust: player.gemBust,
            previousTeam: player.previousTeam,
            isPortal: player.isPortal || !!player.previousTeam,
            pid: player.pid
          })
          addedCount++
        }
      })

      // Save updated commitments
      await updateDynasty(currentDynasty.id, {
        recruitingCommitmentsByTeamYear: updatedCommitments
      })

      setRecruitingSyncStatus({
        success: true,
        message: `Updated ${updatedCount} commitments, added ${addedCount} missing`
      })
    } catch (error) {
      console.error('Recruiting sync failed:', error)
      setRecruitingSyncStatus({ success: false, message: 'Sync failed: ' + error.message })
    }
  }

  // Handle analyze document size
  const handleAnalyzeSize = () => {
    const result = analyzeDocumentSize(currentDynasty.id)
    if (result.success) {
      setSizeAnalysis(result.analysis)
    }
  }

  // Handle optimize document
  const handleOptimize = async () => {
    setOptimizeStatus('running')
    try {
      const result = await optimizeDocumentSize(currentDynasty.id, {
        cleanPlayers: true,
        removeOldBoxScores: removeOldBoxScores,
        keepBoxScoreYears: 2
      })
      setOptimizeStatus(result)
      // Re-analyze after optimization
      if (result.success) {
        handleAnalyzeSize()
      }
    } catch (error) {
      console.error('Optimization failed:', error)
      setOptimizeStatus({ success: false, message: 'Optimization failed: ' + error.message })
    }
  }

  // Handle subcollection migration
  const handleSubcollectionMigration = async () => {
    setSubcollectionMigrationStatus('running')
    try {
      const result = await migrateToSubcollections(currentDynasty.id)
      setSubcollectionMigrationStatus(result)
      // Re-analyze size after migration
      if (result.success) {
        handleAnalyzeSize()
      }
    } catch (error) {
      console.error('Subcollection migration failed:', error)
      setSubcollectionMigrationStatus({ success: false, message: 'Migration failed: ' + error.message })
    }
  }

  const ActionCard = ({ title, description, buttonText, onClick, status, variant = 'normal' }) => {
    const isRunning = status === 'running'
    const isDone = status && status !== 'running'

    return (
      <div
        className="rounded-lg p-4 sm:p-5"
        style={{
          backgroundColor: variant === 'danger' ? '#fef2f2' : teamColors.secondary,
          border: variant === 'danger' ? '2px solid #fca5a5' : `2px solid ${teamColors.primary}30`
        }}
      >
        <h3
          className="font-bold text-base sm:text-lg mb-1"
          style={{ color: variant === 'danger' ? '#b91c1c' : secondaryBgText }}
        >
          {title}
        </h3>
        <p
          className="text-sm mb-4"
          style={{ color: variant === 'danger' ? '#991b1b' : secondaryBgText, opacity: variant === 'danger' ? 0.8 : 0.7 }}
        >
          {description}
        </p>

        <div className="flex items-center gap-3">
          <button
            onClick={onClick}
            disabled={isRunning}
            className="px-4 py-2 rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            style={{
              backgroundColor: variant === 'danger' ? '#dc2626' : teamColors.primary,
              color: variant === 'danger' ? '#fff' : primaryBgText
            }}
          >
            {isRunning ? 'Running...' : buttonText}
          </button>

          {isDone && (
            <span
              className={`text-sm font-medium ${status.success ? 'text-green-600' : 'text-red-600'}`}
            >
              {status.success ? '✓' : '✗'} {status.message}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div
        className="rounded-xl p-5 sm:p-6"
        style={{
          backgroundColor: teamColors.primary,
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${primaryBgText}20` }}
          >
            <svg className="w-6 h-6" fill="none" stroke={primaryBgText} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold" style={{ color: primaryBgText }}>
              Danger Zone
            </h1>
            <p className="text-sm" style={{ color: primaryBgText, opacity: 0.8 }}>
              Data repair and maintenance utilities
            </p>
          </div>
        </div>
      </div>

      {/* Warning Banner */}
      <div
        className="rounded-lg p-4"
        style={{ backgroundColor: '#fef3c7', border: '2px solid #f59e0b' }}
      >
        <div className="flex gap-3">
          <svg className="w-6 h-6 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="text-amber-800">
            <p className="font-bold">Be careful!</p>
            <p className="text-sm mt-1">Always back up your dynasty locally using the <strong>Download Backup</strong> button in the sidebar before doing anything here.</p>
          </div>
        </div>
      </div>

      {/* Data Repair Section */}
      <div>
        <h2
          className="text-lg font-bold mb-3 flex items-center gap-2"
          style={{ color: secondaryBgText }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Data Repair
        </h2>

        <div className="space-y-4">
          <ActionCard
            title="Fix Roster Data"
            description="Repairs roster issues: removes departed players who incorrectly appear on current roster, and ensures recruits have proper team assignments for their enrollment year."
            buttonText="Fix Roster"
            onClick={handleRosterCleanup}
            status={rosterCleanupStatus}
          />

          <ActionCard
            title="Remove Orphaned Roster Entries"
            description="Emergency fix: Removes current year roster entries for players who don't have the previous year. Use this if old players suddenly appeared on your current roster."
            buttonText="Remove Orphans"
            onClick={handleOrphanCleanup}
            status={orphanCleanupStatus}
            variant="danger"
          />

          <ActionCard
            title="Migrate Career Data"
            description="Fills ALL gaps in player career timelines. Ensures every player has complete year-by-year team and class data with no missing seasons."
            buttonText="Run Migration"
            onClick={handleMigration}
            status={migrationStatus}
          />

          <ActionCard
            title="Fix Transferred Players"
            description="Fixes players who transferred away but incorrectly appear on current roster. Also removes entries for players who graduated (were seniors last year)."
            buttonText="Fix Transfers"
            onClick={handleFixTransfers}
            status={transferFixStatus}
            variant="danger"
          />

          <ActionCard
            title="Sync Recruiting Data"
            description="Updates recruiting class data from player records. Fixes missing info on recruiting pages when player data exists but commitment data is incomplete."
            buttonText="Sync Recruiting"
            onClick={handleSyncRecruitingData}
            status={recruitingSyncStatus}
          />
        </div>
      </div>

      {/* Cache Section */}
      <div>
        <h2
          className="text-lg font-bold mb-3 flex items-center gap-2"
          style={{ color: secondaryBgText }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Cache Management
        </h2>

        <div className="space-y-4">
          <ActionCard
            title="Clear Local Cache"
            description="Clears locally cached data including Google Sheets tokens and temporary data. You may need to re-authenticate with Google after this."
            buttonText="Clear Cache"
            onClick={handleClearCache}
            status={clearCacheStatus}
            variant="danger"
          />
        </div>
      </div>

      {/* Document Size Section */}
      <div>
        <h2
          className="text-lg font-bold mb-3 flex items-center gap-2"
          style={{ color: secondaryBgText }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Storage Analysis
        </h2>

        <div
          className="rounded-lg p-4 sm:p-5 space-y-4"
          style={{ backgroundColor: teamColors.secondary, border: `2px solid ${teamColors.primary}30` }}
        >
          {!sizeAnalysis ? (
            <div className="text-center">
              <button
                onClick={handleAnalyzeSize}
                className="px-4 py-2 rounded-lg font-medium text-sm hover:opacity-90"
                style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
              >
                Analyze Storage
              </button>
            </div>
          ) : sizeAnalysis.isMigrated ? (
            /* Migrated to Subcollections View */
            <>
              {/* Storage Type Badge */}
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm font-medium text-green-700">Using Subcollection Storage (No Size Limit)</span>
              </div>

              {/* Main Document */}
              <div className="p-3 rounded-lg bg-white/50">
                <h4 className="font-medium text-sm mb-2" style={{ color: secondaryBgText }}>
                  Main Document
                </h4>
                <div className="flex justify-between text-sm mb-1" style={{ color: secondaryBgText }}>
                  <span>{sizeAnalysis.mainDocTotalKB} KB</span>
                  <span className="opacity-70">{sizeAnalysis.mainDocPercentUsed}% of 1MB limit</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-green-500"
                    style={{ width: `${Math.min(100, parseFloat(sizeAnalysis.mainDocPercentUsed))}%` }}
                  />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-1 text-xs" style={{ color: secondaryBgText }}>
                  {Object.entries(sizeAnalysis.mainDocSections)
                    .filter(([, bytes]) => bytes > 100) // Only show sections > 100 bytes
                    .sort(([,a], [,b]) => b - a)
                    .slice(0, 8) // Show top 8
                    .map(([key, bytes]) => (
                      <div key={key} className="flex justify-between">
                        <span className="opacity-70 truncate">{key.replace(/ByTeamYear|ByYear/g, '')}:</span>
                        <span className="font-mono">{(bytes / 1024).toFixed(1)} KB</span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Subcollections */}
              <div className="p-3 rounded-lg bg-white/50">
                <h4 className="font-medium text-sm mb-2" style={{ color: secondaryBgText }}>
                  Subcollections (Unlimited Storage)
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-2 rounded bg-blue-50">
                    <div className="text-xs text-blue-600 font-medium">Players</div>
                    <div className="text-lg font-bold text-blue-800">{sizeAnalysis.subcollections.players.count}</div>
                    <div className="text-xs text-blue-600">{sizeAnalysis.subcollections.players.sizeKB} KB total</div>
                  </div>
                  <div className="p-2 rounded bg-purple-50">
                    <div className="text-xs text-purple-600 font-medium">Games</div>
                    <div className="text-lg font-bold text-purple-800">{sizeAnalysis.subcollections.games.count}</div>
                    <div className="text-xs text-purple-600">
                      {sizeAnalysis.subcollections.games.sizeKB} KB total
                      <br />
                      {sizeAnalysis.subcollections.games.withBoxScores} with box scores
                    </div>
                  </div>
                </div>
              </div>

              {/* Refresh Button */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleAnalyzeSize}
                  className="px-4 py-2 rounded-lg font-medium text-sm border-2 hover:opacity-90"
                  style={{ borderColor: teamColors.primary, color: teamColors.primary }}
                >
                  Refresh
                </button>
              </div>
            </>
          ) : (
            /* Legacy Single Document View */
            <>
              {/* Storage Type Badge */}
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-yellow-500" />
                <span className="text-sm font-medium text-yellow-700">Legacy Storage (1MB Limit)</span>
              </div>

              {/* Size Bar */}
              <div>
                <div className="flex justify-between text-sm mb-1" style={{ color: secondaryBgText }}>
                  <span className="font-medium">{sizeAnalysis.totalKB} KB used</span>
                  <span className={parseFloat(sizeAnalysis.percentUsed) > 90 ? 'text-red-600 font-bold' : ''}>
                    {sizeAnalysis.percentUsed}% of 1MB limit
                  </span>
                </div>
                <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      parseFloat(sizeAnalysis.percentUsed) > 95 ? 'bg-red-500' :
                      parseFloat(sizeAnalysis.percentUsed) > 80 ? 'bg-yellow-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(100, parseFloat(sizeAnalysis.percentUsed))}%` }}
                  />
                </div>
                {parseFloat(sizeAnalysis.percentUsed) > 95 && (
                  <p className="text-red-600 text-sm mt-2 font-medium">
                    Warning: Document near size limit! Saving may fail.
                  </p>
                )}
              </div>

              {/* Breakdown */}
              <div>
                <h4 className="font-medium text-sm mb-2" style={{ color: secondaryBgText }}>Size Breakdown:</h4>
                <div className="grid grid-cols-2 gap-2 text-sm" style={{ color: secondaryBgText }}>
                  {Object.entries(sizeAnalysis.sections)
                    .filter(([, bytes]) => bytes > 100)
                    .sort(([,a], [,b]) => b - a)
                    .map(([key, bytes]) => (
                      <div key={key} className="flex justify-between">
                        <span className="opacity-70">{key}:</span>
                        <span className="font-mono">{(bytes / 1024).toFixed(1)} KB</span>
                      </div>
                    ))}
                </div>
                <div className="mt-2 pt-2 border-t border-gray-200 text-sm" style={{ color: secondaryBgText }}>
                  <span className="opacity-70">Players: {sizeAnalysis.counts.players} | Games: {sizeAnalysis.counts.games} | Box Scores: {sizeAnalysis.counts.gamesWithBoxScores}</span>
                </div>
              </div>

              {/* Migrate Suggestion */}
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                <p className="text-sm text-blue-800">
                  <strong>Tip:</strong> Migrate to subcollections below to remove the 1MB limit and enable unlimited seasons.
                </p>
              </div>

              {/* Optimize Options */}
              <div className="pt-2 border-t border-gray-200">
                <h4 className="font-medium text-sm mb-2" style={{ color: secondaryBgText }}>Optimization Options:</h4>
                <label className="flex items-center gap-2 text-sm mb-3 cursor-pointer" style={{ color: secondaryBgText }}>
                  <input
                    type="checkbox"
                    checked={removeOldBoxScores}
                    onChange={(e) => setRemoveOldBoxScores(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  Remove box scores older than 2 years (saves significant space)
                </label>
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={handleOptimize}
                    disabled={optimizeStatus === 'running'}
                    className="px-4 py-2 rounded-lg font-medium text-sm hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: '#dc2626', color: '#fff' }}
                  >
                    {optimizeStatus === 'running' ? 'Optimizing...' : 'Optimize Document'}
                  </button>
                  <button
                    onClick={handleAnalyzeSize}
                    className="px-4 py-2 rounded-lg font-medium text-sm border-2 hover:opacity-90"
                    style={{ borderColor: teamColors.primary, color: teamColors.primary }}
                  >
                    Refresh
                  </button>
                  {optimizeStatus && optimizeStatus !== 'running' && (
                    <span className={`text-sm ${optimizeStatus.success ? 'text-green-600' : 'text-red-600'}`}>
                      {optimizeStatus.success ? '✓' : '✗'} {optimizeStatus.message}
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Subcollection Migration Section */}
      <div>
        <h2
          className="text-lg font-bold mb-3 flex items-center gap-2"
          style={{ color: secondaryBgText }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
          </svg>
          Database Structure Migration
        </h2>

        <div
          className="rounded-lg p-4 sm:p-5"
          style={{ backgroundColor: teamColors.secondary, border: `2px solid ${teamColors.primary}30` }}
        >
          {/* Migration Status */}
          <div className="flex items-center gap-3 mb-4">
            <div
              className={`w-3 h-3 rounded-full ${currentDynasty._subcollectionsMigrated ? 'bg-green-500' : 'bg-yellow-500'}`}
            />
            <span className="font-medium" style={{ color: secondaryBgText }}>
              Status: {currentDynasty._subcollectionsMigrated ? 'Migrated to Subcollections ✓' : 'Legacy Structure (Single Document)'}
            </span>
          </div>

          {!currentDynasty._subcollectionsMigrated ? (
            <>
              <p className="text-sm mb-4" style={{ color: secondaryBgText, opacity: 0.8 }}>
                Your dynasty data is stored in a single document. Migrate to subcollections to remove the 1MB size limit and enable unlimited seasons.
                This is safe and can be done at any time. Your data will be preserved.
              </p>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSubcollectionMigration}
                  disabled={subcollectionMigrationStatus === 'running'}
                  className="px-4 py-2 rounded-lg font-medium text-sm hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: '#059669', color: '#fff' }}
                >
                  {subcollectionMigrationStatus === 'running' ? 'Migrating...' : 'Migrate to Subcollections'}
                </button>

                {subcollectionMigrationStatus && subcollectionMigrationStatus !== 'running' && (
                  <span className={`text-sm ${subcollectionMigrationStatus.success ? 'text-green-600' : 'text-red-600'}`}>
                    {subcollectionMigrationStatus.success ? '✓' : '✗'} {subcollectionMigrationStatus.message}
                  </span>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm" style={{ color: secondaryBgText, opacity: 0.8 }}>
              Your dynasty is using the new subcollection structure. Players and games are stored in separate collections,
              removing the 1MB document size limit. You can now track unlimited seasons!
            </p>
          )}
        </div>
      </div>

      {/* Teambuilder Section */}
      {(() => {
        // Find all teambuilder teams in dynasty.teams
        const teams = currentDynasty?.teams || {}
        const teambuilderTeams = Object.values(teams).filter(t => t.isCustom)

        if (teambuilderTeams.length === 0) return null

        return (
          <div>
            <h2
              className="text-lg font-bold mb-3 flex items-center gap-2"
              style={{ color: secondaryBgText }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
              Teambuilder Teams
            </h2>

            <div className="space-y-4">
              {teambuilderTeams.map(team => {
                const originalAbbr = getOriginalTeamAbbr(team.tid)
                const originalName = originalAbbr ? getTeamName(originalAbbr) : TEAMS[team.tid]?.name || 'Unknown'

                return (
                  <div
                    key={team.tid}
                    className="rounded-lg p-4 sm:p-5"
                    style={{
                      backgroundColor: team.secondaryColor || teamColors.secondary,
                      border: `3px solid ${team.primaryColor || teamColors.primary}`
                    }}
                  >
                    <div className="flex items-start gap-4">
                      {/* Team Logo/Badge */}
                      {team.logo ? (
                        <img
                          src={team.logo}
                          alt={team.name}
                          className="w-16 h-16 object-contain rounded-lg flex-shrink-0"
                          style={{
                            backgroundColor: '#fff',
                            padding: '4px',
                            border: `2px solid ${team.primaryColor}`
                          }}
                        />
                      ) : (
                        <div
                          className="w-16 h-16 rounded-lg flex items-center justify-center font-bold text-xl flex-shrink-0"
                          style={{
                            backgroundColor: team.primaryColor,
                            color: team.secondaryColor
                          }}
                        >
                          {team.abbr}
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <h3
                          className="font-bold text-lg truncate"
                          style={{ color: getContrastTextColor(team.secondaryColor || teamColors.secondary) }}
                        >
                          {team.name}
                        </h3>
                        <p
                          className="text-sm"
                          style={{ color: getContrastTextColor(team.secondaryColor || teamColors.secondary), opacity: 0.7 }}
                        >
                          Abbreviation: <span className="font-mono font-bold">{team.abbr}</span>
                        </p>
                        <p
                          className="text-sm"
                          style={{ color: getContrastTextColor(team.secondaryColor || teamColors.secondary), opacity: 0.7 }}
                        >
                          Replaces: {originalName} ({originalAbbr})
                        </p>

                        {/* Color swatches */}
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex items-center gap-1">
                            <div
                              className="w-5 h-5 rounded border border-gray-300"
                              style={{ backgroundColor: team.primaryColor }}
                              title={`Primary: ${team.primaryColor}`}
                            />
                            <span className="text-xs font-mono" style={{ color: getContrastTextColor(team.secondaryColor || teamColors.secondary), opacity: 0.6 }}>
                              {team.primaryColor}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div
                              className="w-5 h-5 rounded border border-gray-300"
                              style={{ backgroundColor: team.secondaryColor }}
                              title={`Secondary: ${team.secondaryColor}`}
                            />
                            <span className="text-xs font-mono" style={{ color: getContrastTextColor(team.secondaryColor || teamColors.secondary), opacity: 0.6 }}>
                              {team.secondaryColor}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2 mt-4">
                      <button
                        onClick={() => {
                          setSelectedTeambuilderTid(team.tid)
                          setShowTeambuilderEditModal(true)
                        }}
                        className="px-4 py-2 rounded-lg font-medium text-sm hover:opacity-90 transition-opacity"
                        style={{
                          backgroundColor: team.primaryColor,
                          color: getContrastTextColor(team.primaryColor)
                        }}
                      >
                        Edit Team
                      </button>
                      <Link
                        to={`${pathPrefix}/team/${team.tid}`}
                        className="px-4 py-2 rounded-lg font-medium text-sm hover:opacity-90 transition-opacity border-2"
                        style={{
                          borderColor: team.primaryColor,
                          color: team.primaryColor,
                          backgroundColor: 'transparent'
                        }}
                      >
                        View Team Page
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Teambuilder Edit Modal */}
      {selectedTeambuilderTid && (
        <TeambuilderEditModal
          isOpen={showTeambuilderEditModal}
          onClose={() => {
            setShowTeambuilderEditModal(false)
            setSelectedTeambuilderTid(null)
          }}
          team={currentDynasty?.teams?.[selectedTeambuilderTid]}
          tid={selectedTeambuilderTid}
          onSave={async (updates) => {
            const result = await updateTeambuilderTeam(currentDynasty.id, selectedTeambuilderTid, updates)
            if (!result.success) {
              throw new Error(result.message)
            }
          }}
        />
      )}

      {/* Info Section */}
      <div
        className="rounded-lg p-4 text-sm"
        style={{ backgroundColor: '#f0f9ff', border: '1px solid #bae6fd' }}
      >
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-blue-800">
            <p className="font-medium mb-1">When to use these tools:</p>
            <ul className="list-disc list-inside space-y-1 opacity-90">
              <li><strong>Fix Roster:</strong> If departed players still appear on your roster, or recruits aren't showing up</li>
              <li><strong>Sync Recruiting:</strong> If recruiting class pages show missing data for players who have full info on their player page</li>
              <li><strong>Clear Cache:</strong> If you're experiencing Google Sheets errors or stale data</li>
              <li><strong>Document Size:</strong> If you're getting "exceeds maximum size" errors when saving</li>
              <li><strong>Database Migration:</strong> If you're hitting the 1MB size limit and need unlimited storage</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
