import { useState, useEffect, useRef, useMemo } from 'react'
import { useDynasty } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import AuthErrorModal from './AuthErrorModal'
import SheetToolbar from './SheetToolbar'
import {
  createAllConferenceSheet,
  readAllConferenceFromSheet,
  deleteGoogleSheet,
  getSheetEmbedUrl
} from '../services/sheetsService'
import { getModalColors, getContrastTextColor } from '../utils/colorUtils'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function AllConferenceModal({ isOpen, onClose, onSave, currentYear, teamColors }) {
  const { currentDynasty, updateDynasty } = useDynasty()
  const { user, signOut, refreshSession } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])
  const [refreshing, setRefreshing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [creatingSheet, setCreatingSheet] = useState(false)
  const [sheetId, setSheetId] = useState(null)
  const [showDeletedNote, setShowDeletedNote] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [isMobile, setIsMobile] = useState(false)
  const [showAuthError, setShowAuthError] = useState(false)
  const [useEmbedded, setUseEmbedded] = useState(() => {
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  // Ref to prevent concurrent sheet creation
  const creatingSheetRef = useRef(false)

  useEffect(() => {
    setIsMobile(isMobileDevice())
    const handleResize = () => setIsMobile(isMobileDevice())
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!isOpen || !sheetId || useEmbedded) return
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setHighlightSave(true)
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

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => { document.body.style.overflow = 'unset' }
  }, [isOpen])

  useEffect(() => {
    const createSheet = async () => {
      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote) {
        // Check for existing sheet for this year
        const existingSheetId = currentDynasty?.allConferenceSheetIdByYear?.[currentYear]
        if (existingSheetId) {
          setSheetId(existingSheetId)
          return
        }
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          // Get existing all-conference data grouped by conference for pre-filling
          const allConferenceByConference = currentDynasty?.allAmericansByYear?.[currentYear]?.allConferenceByConference || {}
          // Get custom conferences for this year (if any)
          const customConferences = currentDynasty?.conferencesByYear?.[currentYear] || null
          // Get custom teams for dropdown validation
          const customTeams = currentDynasty?.teams || currentDynasty?.customTeams || null
          const sheetInfo = await createAllConferenceSheet(
            currentYear,
            allConferenceByConference,
            customConferences,
            customTeams
          )
          setSheetId(sheetInfo.spreadsheetId)
          const existingByYear = currentDynasty?.allConferenceSheetIdByYear || {}
          await updateDynasty(currentDynasty.id, {
            allConferenceSheetIdByYear: { ...existingByYear, [currentYear]: sheetInfo.spreadsheetId }
          })
        } catch (error) {
          console.error('Failed to create all-conference sheet:', error)
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }
    createSheet()
  }, [isOpen, user, sheetId, creatingSheet, currentDynasty?.id, retryCount, showDeletedNote])

  useEffect(() => {
    if (!isOpen) {
      setShowDeletedNote(false)
      creatingSheetRef.current = false
    }
  }, [isOpen])

  const handleSyncFromSheet = async () => {
    if (!sheetId) return
    setSyncing(true)
    try {
      // Read from all conference tabs
      const data = await readAllConferenceFromSheet(sheetId)
      await onSave(data)
      onClose()
    } catch (error) {
      console.error(error)
      if (error.message?.includes('OAuth') || error.message?.includes('access token')) {
        setShowAuthError(true)
      } else {
        toast.error('Failed to sync from Google Sheets.')
      }
    } finally {
      setSyncing(false)
    }
  }

  const handleSyncAndDelete = async () => {
    if (!sheetId) return
    setDeletingSheet(true)
    try {
      const data = await readAllConferenceFromSheet(sheetId)
      await onSave(data)
      await deleteGoogleSheet(sheetId)
      setSheetId(null)
      setShowDeletedNote(true)
      setTimeout(() => onClose(), 2500)
    } catch (error) {
      console.error('Error in handleSyncAndDelete:', error)
      if (error.message?.includes('OAuth') || error.message?.includes('access token')) {
        setShowAuthError(true)
      } else {
        toast.error(`Failed to sync/delete: ${error.message || 'Unknown error'}`)
      }
    } finally {
      setDeletingSheet(false)
    }
  }

  const handleRegenerateSheet = async () => {
    if (!sheetId) return
    const confirmed = await confirm({
      title: 'Regenerate sheet?',
      message: "This will delete your current sheet and create a fresh one. Any unsaved data will be lost.",
      confirmLabel: 'Regenerate',
      variant: 'danger',
    })
    if (!confirmed) return
    setRegenerating(true)
    try {
      await deleteGoogleSheet(sheetId)
      const existingByYear = currentDynasty?.allConferenceSheetIdByYear || {}
      await updateDynasty(currentDynasty.id, {
        allConferenceSheetIdByYear: { ...existingByYear, [currentYear]: null }
      })
      setSheetId(null)
      setRetryCount(c => c + 1)
    } catch (error) {
      console.error('Failed to regenerate sheet:', error)
      if (error.message?.includes('OAuth') || error.message?.includes('access token')) {
        setShowAuthError(true)
      } else {
        toast.error('Failed to regenerate sheet. Please try again.')
      }
    } finally {
      setRegenerating(false)
    }
  }

  const handleClose = () => onClose()

  if (!isOpen) return null

  // Default to first conference tab for embed
  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'ACC') : null
  const isLoading = creatingSheet

  return (
    <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4" style={{ margin: 0 }} onMouseDown={handleClose}>
      <div className="card-elevated w-full sm:w-[95vw] max-h-[calc(100dvh-4rem)] sm:h-[95dvh] flex flex-col overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <div className="h-[3px] w-full" style={{ backgroundColor: modalColors.accent }} aria-hidden="true" />
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-surface-4">
          <h2 className="text-2xl font-bold text-txt-primary">{currentYear} All-Conference</h2>
          <button aria-label="Close" onClick={handleClose} className="text-txt-tertiary hover:text-txt-primary transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin w-12 h-12 border-4 rounded-full mx-auto mb-4" style={{ borderColor: modalColors.accent, borderTopColor: 'transparent' }} />
              <p className="text-lg font-semibold text-txt-primary">Creating All-Conference Sheet...</p>
              <p className="text-sm mt-2 text-txt-tertiary">10 conference tabs</p>
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 border-l-[3px] text-center max-w-sm" style={{ borderLeftColor: modalColors.accent }}>
              <p className="label-xs text-txt-tertiary mb-2">Status</p>
              <p className="text-xl font-bold text-txt-primary mb-2">Saved &amp; Moved to Trash</p>
              <p className="text-sm text-txt-secondary">All-Conference selections saved.</p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {!isMobile && useEmbedded && (
              <div className="mb-3">
                <div className="flex gap-3 flex-wrap items-center">
                  <button onClick={handleSyncAndDelete} disabled={syncing || deletingSheet} className={`px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-all text-sm ${highlightSave ? 'animate-pulse ring-4 ring-offset-2 scale-105' : ''}`} style={{ backgroundColor: modalColors.accent, color: getContrastTextColor(modalColors.accent) }}>{deletingSheet ? 'Saving...' : 'Save & Move to Trash'}</button>
                  <button onClick={handleSyncFromSheet} disabled={syncing || deletingSheet} className="btn btn-secondary text-sm">{syncing ? 'Syncing...' : 'Save & Keep Sheet'}</button>
                  <button onClick={handleRegenerateSheet} disabled={syncing || deletingSheet || regenerating} className="px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors text-sm border-2 ml-auto" style={{ backgroundColor: 'transparent', borderColor: '#EF4444', color: '#EF4444' }}>{regenerating ? 'Regenerating...' : 'Regenerate sheet'}</button>
                </div>
              </div>
            )}
            {!isMobile && (
              <div className="flex items-center justify-end mb-2">
                <button onClick={() => { const newValue = !useEmbedded; setUseEmbedded(newValue); localStorage.setItem('sheetEmbedPreference', newValue.toString()); }} className="text-xs px-3 py-1 rounded-full border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent">{useEmbedded ? '← Back to default view' : 'Try embedded view (beta)'}</button>
              </div>
            )}
            {isMobile || !useEmbedded ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                <h3 className="label-xs text-txt-tertiary mb-2">Data Entry</h3>
                <p className="text-2xl font-bold text-txt-primary mb-6">Edit in Google Sheets</p>
                <div className="text-left mb-6 max-w-sm w-full card p-4 border-l-[3px]" style={{ borderLeftColor: modalColors.accent }}>
                  <p className="label-xs text-txt-tertiary mb-3">Instructions</p>
                  <ol className="text-sm space-y-2 text-txt-secondary">
                    <li className="flex gap-3"><span className="font-bold text-txt-primary tabular-nums">1.</span><span>Tap the button below to open Google Sheets</span></li>
                    <li className="flex gap-3"><span className="font-bold text-txt-primary tabular-nums">2.</span><span>Each tab is a conference - fill in Player, Team, Class</span></li>
                    <li className="flex gap-3"><span className="font-bold text-txt-primary tabular-nums">3.</span><span>Return to this app when done</span></li>
                    <li className="flex gap-3"><span className="font-bold text-txt-primary tabular-nums">4.</span><span>Tap "Save" below to sync results</span></li>
                  </ol>
                </div>
                <a href={`https://docs.google.com/spreadsheets/d/${sheetId}/edit`} target="_blank" rel="noopener noreferrer" className="px-6 py-3 rounded-lg font-bold text-lg hover:opacity-90 transition-colors flex items-center gap-2 mb-6" style={{ backgroundColor: '#0F9D58', color: '#FFFFFF' }}>
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/><path d="M7 7h2v2H7zm0 4h2v2H7zm0 4h2v2H7zm4-8h6v2h-6zm0 4h6v2h-6zm0 4h6v2h-6z"/></svg>
                  Open Google Sheets
                </a>
                <div className="flex flex-col sm:flex-row gap-3 items-center justify-center mb-4">
                  <button onClick={handleSyncAndDelete} disabled={syncing || deletingSheet} className={`px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-all text-sm ${highlightSave ? 'animate-pulse ring-4 ring-offset-2 scale-105' : ''}`} style={{ backgroundColor: modalColors.accent, color: getContrastTextColor(modalColors.accent) }}>{deletingSheet ? 'Saving...' : 'Save & Move to Trash'}</button>
                  <button onClick={handleSyncFromSheet} disabled={syncing || deletingSheet} className="btn btn-secondary px-6 py-3 text-sm">{syncing ? 'Syncing...' : 'Save & Keep Sheet'}</button>
                </div>
                <button onClick={handleRegenerateSheet} disabled={syncing || deletingSheet || regenerating} className="text-xs px-4 py-2 rounded-lg font-medium hover:opacity-90 transition-colors border mb-4" style={{ backgroundColor: 'transparent', borderColor: '#EF4444', color: '#EF4444' }}>{regenerating ? 'Regenerating...' : 'Messed up? Regenerate sheet'}</button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                <SheetToolbar sheetId={sheetId} embedUrl={embedUrl} teamColors={teamColors} title="All-Conference" onSessionError={() => setShowAuthError(true)} />
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-lg mb-4 text-txt-primary">Your session has expired.</p>
              <div className="flex gap-3 justify-center">
                <button onClick={async () => { setRefreshing(true); try { const success = await refreshSession(); if (success) setRetryCount(c => c + 1); } catch (e) { console.error(e); } setRefreshing(false); }} disabled={refreshing} className="px-4 py-2 rounded font-semibold" style={{ backgroundColor: modalColors.accent, color: getContrastTextColor(modalColors.accent), opacity: refreshing ? 0.7 : 1 }}>{refreshing ? 'Refreshing...' : 'Refresh Session'}</button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
      <AuthErrorModal isOpen={showAuthError} onClose={() => setShowAuthError(false)} onRefresh={() => setRetryCount(c => c + 1)} teamColors={teamColors} />
    </div>
  )
}
