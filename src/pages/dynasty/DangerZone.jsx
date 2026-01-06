import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { useTeamColors } from '../../hooks/useTeamColors'
import { getContrastTextColor } from '../../utils/colorUtils'

export default function DangerZone() {
  const { currentDynasty, cleanupRosterData, isViewOnly } = useDynasty()
  const { id: dynastyId } = useParams()
  const teamColors = useTeamColors(currentDynasty?.teamName)
  const primaryBgText = getContrastTextColor(teamColors.primary)
  const secondaryBgText = getContrastTextColor(teamColors.secondary)

  // Status states for each action
  const [rosterCleanupStatus, setRosterCleanupStatus] = useState(null)
  const [clearCacheStatus, setClearCacheStatus] = useState(null)

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
          <h2 className="text-xl font-bold mb-2" style={{ color: secondaryBgText }}>Admin Tools</h2>
          <p style={{ color: secondaryBgText, opacity: 0.7 }}>Admin tools are not available in view-only mode.</p>
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
              Admin Tools
            </h1>
            <p className="text-sm" style={{ color: primaryBgText, opacity: 0.8 }}>
              Data repair and maintenance utilities
            </p>
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
              <li><strong>Clear Cache:</strong> If you're experiencing Google Sheets errors or stale data</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
