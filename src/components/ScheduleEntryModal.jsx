import { useState, useEffect, useRef, useMemo } from 'react'
import ScheduleSpreadsheet from './ScheduleSpreadsheet'
import SheetToolbar, { SheetErrorBanner } from './SheetToolbar'
import {
  createScheduleSheet,
  readScheduleFromScheduleSheet,
  deleteGoogleSheet,
  getSingleSheetEmbedUrl
} from '../services/sheetsService'
import { useDynasty, getCurrentSchedule, getScheduleForTeam } from '../context/DynastyContext'
import { getAbbrFromTid } from '../data/teamRegistry'
import { useAuth } from '../context/AuthContext'
import { getModalColors } from '../utils/colorUtils'

export default function ScheduleEntryModal({ isOpen, onClose, onSave, currentYear, teamColors, teamTid, teamName }) {
  const { currentDynasty, updateDynasty } = useDynasty()
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])

  // Resolve team name for display - use provided teamName or fall back to dynasty team
  const displayTeamName = teamName || currentDynasty?.teamName || 'Dynasty'
  // Resolve team abbreviation for the sheet
  const targetTeamAbbr = teamTid ? getAbbrFromTid(teamTid) : (currentDynasty?.teamName || '')
  const { user, signOut, refreshSession } = useAuth()
  const [refreshing, setRefreshing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [creatingSheet, setCreatingSheet] = useState(false)
  const [sheetId, setSheetId] = useState(null)
  const [showDeletedNote, setShowDeletedNote] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [useEmbedded, setUseEmbedded] = useState(() => {
    // Load preference from localStorage
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [showSessionError, setShowSessionError] = useState(false)
  const [highlightSave, setHighlightSave] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  // Ref to prevent concurrent sheet creation (state updates are async, refs are immediate)
  const creatingSheetRef = useRef(false)

  // Highlight save button when user returns to the window (after editing in Google Sheets)
  useEffect(() => {
    if (!isOpen || !sheetId || useEmbedded) return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setHighlightSave(true)
        // Remove highlight after 5 seconds
        setTimeout(() => setHighlightSave(false), 5000)
      }
    }

    const handleFocus = () => {
      setHighlightSave(true)
      setTimeout(() => setHighlightSave(false), 5000)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [isOpen, sheetId, useEmbedded])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }

    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  // Create schedule sheet when modal opens - always create fresh
  useEffect(() => {
    const createSheet = async () => {
      // Don't create a new sheet if we just deleted one (showing success message)
      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote) {
        // Set ref immediately to prevent concurrent calls (state updates are async)
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          // Get existing schedule to pre-fill the sheet
          // Use team-specific schedule if teamTid is provided, otherwise use current team's schedule
          const existingSchedule = teamTid
            ? getScheduleForTeam(currentDynasty, teamTid, currentYear) || []
            : getCurrentSchedule(currentDynasty) || []

          // Always create a fresh sheet, but pre-fill with existing data if available
          const sheetInfo = await createScheduleSheet(
            displayTeamName,
            currentYear,
            targetTeamAbbr,
            existingSchedule,
            currentDynasty?.teams || currentDynasty?.customTeams
          )
          setSheetId(sheetInfo.spreadsheetId)

          // Save sheet ID to dynasty
          await updateDynasty(currentDynasty.id, {
            scheduleSheetId: sheetInfo.spreadsheetId
          })
        } catch (error) {
          console.error('Failed to create schedule sheet:', error)
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }

    createSheet()
  }, [isOpen, user, sheetId, creatingSheet, currentDynasty?.id, retryCount, showDeletedNote, teamTid, currentYear, displayTeamName, targetTeamAbbr])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowDeletedNote(false)
      creatingSheetRef.current = false
    }
  }, [isOpen])

  const handleSave = async (schedule) => {
    try {
      await onSave(schedule)
      onClose()
    } catch (error) {
      alert('Failed to save schedule.')
      console.error(error)
    }
  }

  const handleSyncFromSheet = async () => {
    if (!sheetId) return

    setSyncing(true)
    try {
      const schedule = await readScheduleFromScheduleSheet(sheetId)
      await onSave(schedule)
      onClose()
    } catch (error) {
      alert('Failed to sync from Google Sheets. Make sure data is properly formatted.')
      console.error(error)
    } finally {
      setSyncing(false)
    }
  }

  const handleSyncAndDelete = async () => {
    if (!sheetId) return

    setDeletingSheet(true)
    try {
      const schedule = await readScheduleFromScheduleSheet(sheetId)
      await onSave(schedule)

      // Move sheet to trash (keep sheet ID stored so user can restore if needed)
      await deleteGoogleSheet(sheetId)

      setSheetId(null)
      setShowDeletedNote(true)
      setTimeout(() => {
        onClose()
      }, 2500)
    } catch (error) {
      console.error('Failed to sync/move to trash:', error)
      alert(`Failed to sync/move to trash: ${error.message || 'Unknown error'}`)
    } finally {
      setDeletingSheet(false)
    }
  }

  const handleRegenerateSheet = async () => {
    if (!sheetId) return

    const confirmed = window.confirm('This will delete your current sheet and create a fresh one. Any unsaved data will be lost. Continue?')
    if (!confirmed) return

    setRegenerating(true)
    try {
      // Delete the current sheet
      await deleteGoogleSheet(sheetId)

      // Clear sheet ID from dynasty
      await updateDynasty(currentDynasty.id, {
        scheduleSheetId: null
      })

      // Reset local state to trigger new sheet creation
      setSheetId(null)
      setRetryCount(c => c + 1)
    } catch (error) {
      console.error('Failed to regenerate sheet:', error)
      if (error.message?.includes('OAuth') || error.message?.includes('access token')) {
        setShowSessionError(true)
      } else {
        alert('Failed to regenerate sheet. Please try again.')
      }
    } finally {
      setRegenerating(false)
    }
  }

  const handleClose = () => {
    onClose()
  }

  if (!isOpen) return null

  const embedUrl = sheetId ? getSingleSheetEmbedUrl(sheetId) : null
  const isLoading = creatingSheet

  return (
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={handleClose}
    >
      <div
        className="rounded-lg shadow-xl w-full sm:w-[95vw] max-h-[calc(100vh-4rem)] sm:h-[95vh] flex flex-col p-4 sm:p-6 border"
        style={{ backgroundColor: modalColors.background, borderColor: modalColors.border }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold" style={{ color: modalColors.text }}>
            {teamTid ? `${displayTeamName} ${currentYear} Schedule` : 'Schedule Entry'}
          </h2>
          <button
            onClick={handleClose}
            className="hover:opacity-70"
            style={{ color: modalColors.textMuted }}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div
                className="animate-spin w-12 h-12 border-4 rounded-full mx-auto mb-4"
                style={{
                  borderColor: modalColors.accent,
                  borderTopColor: 'transparent'
                }}
              />
              <p className="text-lg font-semibold" style={{ color: modalColors.text }}>
                Creating Schedule Sheet...
              </p>
              <p className="text-sm mt-2" style={{ color: modalColors.textMuted }}>
                Setting up 12-game schedule
              </p>
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center p-8 rounded-lg" style={{ backgroundColor: modalColors.accent }}>
              <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="#ffffff" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-xl font-bold mb-2" style={{ color: '#ffffff' }}>
                Saved & Moved to Trash!
              </p>
              <p className="text-sm" style={{ color: '#ffffff', opacity: 0.9 }}>
                Schedule saved to your dynasty.
              </p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Action Buttons - only show at top for embedded view */}
            {useEmbedded && (
              <div className="mb-3">
                <div className="flex gap-2 sm:gap-3 flex-wrap items-center">
                  <button
                    onClick={handleSyncAndDelete}
                    disabled={syncing || deletingSheet}
                    className={`px-3 sm:px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-all text-xs sm:text-sm ${highlightSave ? 'animate-pulse ring-4 ring-offset-2 scale-105' : ''}`}
                    style={{
                      backgroundColor: modalColors.accent,
                      color: '#ffffff',
                      ringColor: modalColors.accent
                    }}
                  >
                    {deletingSheet ? 'Saving...' : '✓ Save & Move to Trash'}
                  </button>
                  <button
                    onClick={handleSyncFromSheet}
                    disabled={syncing || deletingSheet}
                    className="px-3 sm:px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors text-xs sm:text-sm border-2"
                    style={{
                      backgroundColor: 'transparent',
                      borderColor: modalColors.accent,
                      color: modalColors.accent
                    }}
                  >
                    {syncing ? 'Syncing...' : 'Save & Keep Sheet'}
                  </button>
                  <button
                    onClick={handleRegenerateSheet}
                    disabled={syncing || deletingSheet || regenerating}
                    className="px-3 sm:px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors text-xs sm:text-sm border-2 ml-auto"
                    style={{
                      backgroundColor: 'transparent',
                      borderColor: '#EF4444',
                      color: '#EF4444'
                    }}
                  >
                    {regenerating ? 'Regenerating...' : 'Regenerate sheet'}
                  </button>
                  {highlightSave && (
                    <span className="text-xs font-medium animate-bounce" style={{ color: modalColors.accent }}>

                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Toggle between embedded and new tab */}
            <div className="flex items-center justify-end mb-2">
              <button
                onClick={() => {
                  const newValue = !useEmbedded
                  setUseEmbedded(newValue)
                  localStorage.setItem('sheetEmbedPreference', newValue.toString())
                }}
                className="text-xs px-3 py-1 rounded-full border transition-colors"
                style={{
                  borderColor: modalColors.accent,
                  color: modalColors.accent,
                  backgroundColor: 'transparent'
                }}
              >
                {useEmbedded ? '← Back to default view' : 'Try embedded view (beta)'}
              </button>
            </div>

            {/* Session Error Banner */}
            {showSessionError && (
              <SheetErrorBanner
                teamColors={teamColors}
                onReload={() => {
                  setShowSessionError(false)
                  setRetryCount(c => c + 1)
                }}
                onOpenNewTab={() => window.open(`https://docs.google.com/spreadsheets/d/${sheetId}/edit`, '_blank')}
                onRefreshSession={async () => {
                  const success = await refreshSession()
                  if (success) {
                    setShowSessionError(false)
                    setRetryCount(c => c + 1)
                  }
                }}
              />
            )}

            {useEmbedded ? (
              /* Embedded iframe view with toolbar */
              <>
                <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                  <SheetToolbar
                    sheetId={sheetId}
                    embedUrl={embedUrl}
                    teamColors={teamColors}
                    title="Schedule Google Sheet"
                    onSessionError={() => setShowSessionError(true)}
                  />
                </div>

                <div className="text-xs mt-2 space-y-1" style={{ color: modalColors.textMuted }}>
                  <p><strong>Columns:</strong> Week | User Team | CPU Team | Site</p>
                  <p>Enter your 12-game regular season schedule. Select opponents and Home/Road/Neutral for each game.</p>
                </div>
              </>
            ) : (
              /* Open in new tab view */
              <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
                  style={{ backgroundColor: modalColors.accent }}
                >
                  <svg className="w-10 h-10" fill="none" stroke="#ffffff" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>

                <h3 className="text-xl font-bold mb-3" style={{ color: modalColors.text }}>
                  Edit in Google Sheets
                </h3>

                <div className="text-left mb-6 max-w-sm">
                  <p className="text-sm font-semibold mb-2" style={{ color: modalColors.text }}>
                    Instructions:
                  </p>
                  <ol className="text-sm space-y-1.5" style={{ color: modalColors.textMuted }}>
                    <li className="flex gap-2">
                      <span className="font-bold">1.</span>
                      <span>Click the button below to open Google Sheets in a new tab</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold">2.</span>
                      <span>Enter your 12-game schedule (Week, User Team, CPU Team, Site)</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold">3.</span>
                      <span>Return to this tab when done</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold">4.</span>
                      <span>Click "Save" below to sync your schedule</span>
                    </li>
                  </ol>
                </div>

                <a
                  href={`https://docs.google.com/spreadsheets/d/${sheetId}/edit`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-8 py-4 rounded-lg font-bold text-lg hover:opacity-90 transition-colors flex items-center gap-3 mb-6"
                  style={{
                    backgroundColor: '#0F9D58',
                    color: '#FFFFFF'
                  }}
                >
                  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/>
                    <path d="M7 7h2v2H7zm0 4h2v2H7zm0 4h2v2H7zm4-8h6v2h-6zm0 4h6v2h-6zm0 4h6v2h-6z"/>
                  </svg>
                  Open Google Sheets
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>

                {/* Centered Save Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 items-center justify-center mb-6">
                  <button
                    onClick={handleSyncAndDelete}
                    disabled={syncing || deletingSheet}
                    className={`px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-all text-sm ${highlightSave ? 'animate-pulse ring-4 ring-offset-2 scale-105' : ''}`}
                    style={{
                      backgroundColor: modalColors.accent,
                      color: '#ffffff',
                      ringColor: modalColors.accent
                    }}
                  >
                    {deletingSheet ? 'Saving...' : '✓ Save & Move to Trash'}
                  </button>
                  <button
                    onClick={handleSyncFromSheet}
                    disabled={syncing || deletingSheet}
                    className="px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-colors text-sm border-2"
                    style={{
                      backgroundColor: 'transparent',
                      borderColor: modalColors.accent,
                      color: modalColors.accent
                    }}
                  >
                    {syncing ? 'Syncing...' : 'Save & Keep Sheet'}
                  </button>
                </div>
                {/* Start Over Button */}
                <button
                  onClick={handleRegenerateSheet}
                  disabled={syncing || deletingSheet || regenerating}
                  className="text-xs px-4 py-2 rounded-lg font-medium hover:opacity-90 transition-colors border mb-4"
                  style={{
                    backgroundColor: 'transparent',
                    borderColor: '#EF4444',
                    color: '#EF4444'
                  }}
                >
                  {regenerating ? 'Regenerating...' : 'Messed up? Regenerate sheet'}
                </button>
                {highlightSave && (
                  <span className="text-sm font-medium animate-bounce mb-4" style={{ color: modalColors.accent }}>

                  </span>
                )}

                <div className="text-xs p-3 rounded-lg max-w-sm" style={{ backgroundColor: modalColors.inputBg, color: modalColors.textMuted }}>
                  <p className="font-semibold mb-1" style={{ color: modalColors.text }}>Columns to fill:</p>
                  <p>Week | User Team | CPU Team | Site (Home/Road/Neutral)</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-lg mb-4" style={{ color: modalColors.text }}>
                Your session has expired. Click below to refresh.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={async () => {
                    setRefreshing(true)
                    try {
                      const success = await refreshSession()
                      if (success) {
                        setRetryCount(c => c + 1)
                      }
                    } catch (e) {
                      console.error('Refresh failed:', e)
                    }
                    setRefreshing(false)
                  }}
                  disabled={refreshing}
                  className="px-4 py-2 rounded font-semibold transition-colors"
                  style={{
                    backgroundColor: modalColors.accent,
                    color: '#ffffff',
                    opacity: refreshing ? 0.7 : 1
                  }}
                >
                  {refreshing ? 'Refreshing...' : 'Refresh Session'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
