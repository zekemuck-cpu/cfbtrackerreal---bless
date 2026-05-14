import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  createConferenceChampionshipsHistorySheet,
  readConferenceChampionshipsHistoryFromSheet,
  deleteGoogleSheet,
  getSingleSheetEmbedUrl,
} from '../services/sheetsService'
import { useDynasty } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import SheetLoadingHint from './SheetLoadingHint'
import AuthErrorModal from './AuthErrorModal'
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

/**
 * ConferenceChampionshipsHistorySheetModal — multi-year edit surface for
 * conference championship games. One Google Sheet, one tab per year
 * (current year first, then descending past years). Each tab uses the
 * same 5-column layout as the single-year CC sheet (Conference, Team 1,
 * Team 2, Team 1 Score, Team 2 Score) pre-filled with that year's
 * existing CC games.
 *
 * One sheet per dynasty — the sheet ID is persisted on
 * `dynasty.confChampHistorySheetId` so re-opening the modal resumes the
 * existing sheet instead of creating a fresh one.
 *
 * Save flow:
 *   1. read every "[YYYY] Conference Championships" tab via
 *      readConferenceChampionshipsHistoryFromSheet
 *   2. push the per-year payloads into
 *      saveConferenceChampionshipsHistoryFromSheet which applies all
 *      years in a single updateDynasty call (avoiding the React-state
 *      staleness race that sequential per-year saves would hit)
 *   3. optionally delete the sheet after save
 */
export default function ConferenceChampionshipsHistorySheetModal({ isOpen, onClose }) {
  const { currentDynasty, updateDynasty, saveConferenceChampionshipsHistoryFromSheet, isViewOnly } = useDynasty()
  const { user } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()

  const [creatingSheet, setCreatingSheet] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [sheetId, setSheetId] = useState(null)
  const [showDeletedNote, setShowDeletedNote] = useState(false)
  const [isMobile, setIsMobile] = useState(isMobileDevice)
  const auth = useAuthErrorHandler()
  const creatingSheetRef = useRef(false)

  useEffect(() => {
    const handleResize = () => setIsMobile(isMobileDevice())
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Resume session — pull sheetId off the dynasty if one's stored.
  useEffect(() => {
    if (!isOpen) return
    if (currentDynasty?.confChampHistorySheetId && !sheetId && !showDeletedNote) {
      setSheetId(currentDynasty.confChampHistorySheetId)
    }
  }, [isOpen, currentDynasty?.confChampHistorySheetId, sheetId, showDeletedNote])

  // Create the sheet on first open / after a delete.
  useEffect(() => {
    if (!isOpen || !user || sheetId || creatingSheet || creatingSheetRef.current) return
    if (!currentDynasty?.id || isViewOnly) return
    if (showDeletedNote) return

    const create = async () => {
      creatingSheetRef.current = true
      setCreatingSheet(true)
      try {
        const dynastyName = currentDynasty.dynastyName || currentDynasty.teamName || 'Dynasty'
        const info = await createConferenceChampionshipsHistorySheet(dynastyName, currentDynasty)
        setSheetId(info.spreadsheetId)
        await updateDynasty(currentDynasty.id, { confChampHistorySheetId: info.spreadsheetId })
      } catch (error) {
        console.error('Failed to create CC history sheet:', error)
        if (!auth.handleError(error)) {
          toast.error('Failed to create the conference championships sheet — try again.')
        }
      } finally {
        setCreatingSheet(false)
        creatingSheetRef.current = false
      }
    }
    create()
  }, [isOpen, user, sheetId, creatingSheet, currentDynasty?.id, auth.retryCount, showDeletedNote, isViewOnly])

  // Reset state on close so re-opening starts clean.
  useEffect(() => {
    if (!isOpen) {
      setShowDeletedNote(false)
    }
  }, [isOpen])

  const handleSyncFromSheet = async (alsoDelete = false) => {
    if (!sheetId || !currentDynasty) return
    if (alsoDelete) setDeletingSheet(true)
    else setSyncing(true)
    try {
      const result = await readConferenceChampionshipsHistoryFromSheet(
        sheetId,
        currentDynasty.teams || currentDynasty.customTeams,
      )
      if (!result.years || result.years.length === 0) {
        toast.error('No year tabs found on the sheet. Try regenerating the sheet.')
        return
      }

      // Guardrail: any year tab that came back fully blank AND has ≥1
      // existing CC games in the dynasty gets dropped from the save.
      // Almost always an accidental select-all-delete on a past tab —
      // refusing keeps the existing history intact. The user can still
      // delete CC games individually via the game page if they really
      // mean to wipe a year.
      const existingCCCountByYear = {}
      for (const g of (currentDynasty.games || [])) {
        if (!(g?.isConferenceChampionship || g?.gameType === 'conference_championship')) continue
        const y = Number(g.year)
        if (!Number.isFinite(y)) continue
        existingCCCountByYear[y] = (existingCCCountByYear[y] || 0) + 1
      }
      const refusedYears = []
      const safeByYear = {}
      for (const [yearStr, list] of Object.entries(result.byYear)) {
        const year = Number(yearStr)
        const validRows = (list || []).filter(cc =>
          cc?.team1 && cc?.team2 && cc.team1Score != null && cc.team2Score != null
        ).length
        if (validRows === 0 && (existingCCCountByYear[year] || 0) >= 1) {
          refusedYears.push(year)
          continue
        }
        safeByYear[yearStr] = list
      }
      if (refusedYears.length > 0) {
        refusedYears.sort((a, b) => b - a)
        toast.error(
          `Skipped ${refusedYears.join(', ')} — empty tab${refusedYears.length === 1 ? '' : 's'} would have wiped existing CC games. Re-enter at least one row to save those years.`,
          { duration: 8000 },
        )
      }
      if (Object.keys(safeByYear).length === 0 && refusedYears.length > 0) {
        return
      }

      const applied = await saveConferenceChampionshipsHistoryFromSheet(
        currentDynasty.id,
        safeByYear,
      )

      const yearsTouched = applied?.yearsApplied || []
      const totalGames = Object.values(applied?.gameCountsByYear || {}).reduce((s, n) => s + n, 0)
      toast.success(
        `Saved Conference Championships — ${totalGames} game${totalGames === 1 ? '' : 's'} across ${yearsTouched.length} year${yearsTouched.length === 1 ? '' : 's'}.`,
      )

      if (alsoDelete) {
        try { await deleteGoogleSheet(sheetId) } catch (e) { console.error('Failed to delete sheet:', e) }
        await updateDynasty(currentDynasty.id, { confChampHistorySheetId: null })
        setSheetId(null)
        setShowDeletedNote(true)
        setTimeout(() => onClose(), 1800)
      }
    } catch (error) {
      console.error('Failed to sync CC history sheet:', error)
      if (!auth.handleError(error)) {
        toast.error('Failed to read the sheet. Make sure data is properly formatted and try again.')
      }
    } finally {
      setSyncing(false)
      setDeletingSheet(false)
    }
  }

  const handleDeleteSheetOnly = async () => {
    if (!sheetId || !currentDynasty) return
    const ok = await confirm({
      title: 'Delete this conference championships sheet?',
      message: 'This deletes the Google Sheet without applying any edits. Your dynasty conference championship data stays as-is.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    setDeletingSheet(true)
    try {
      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { confChampHistorySheetId: null })
      setSheetId(null)
      setShowDeletedNote(true)
      setTimeout(() => onClose(), 1800)
    } catch (error) {
      console.error('Failed to delete CC history sheet:', error)
      if (!auth.handleError(error)) {
        toast.error('Failed to delete the sheet — try again.')
      }
    } finally {
      setDeletingSheet(false)
    }
  }

  if (!isOpen) return null

  const embedUrl = sheetId ? getSingleSheetEmbedUrl(sheetId) : null

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={onClose}
    >
      <div
        className="card-elevated w-full sm:w-[95vw] max-h-[calc(100dvh-4rem)] sm:h-[95dvh] flex flex-col overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 sm:px-7 py-4 border-b border-surface-4">
          <div className="flex flex-col">
            <h2 className="text-xl sm:text-2xl font-bold text-txt-primary tracking-tight">Conference Championships</h2>
          </div>
          <button
            aria-label="Close"
            onClick={onClose}
            className="text-txt-tertiary hover:text-txt-primary transition-colors -mr-1 p-1.5 rounded-md hover:bg-surface-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {creatingSheet ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center">
                <div
                  className="animate-spin w-10 h-10 border-2 rounded-full mx-auto mb-4"
                  style={{ borderColor: 'var(--text-primary)', borderTopColor: 'transparent' }}
                />
                <SheetLoadingHint active={creatingSheet} />
              </div>
            </div>
          ) : showDeletedNote ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center max-w-sm">
                <p className="text-xl font-bold text-txt-primary">Saved</p>
              </div>
            </div>
          ) : sheetId ? (
            isMobile ? (
              <div className="flex-1 overflow-y-auto">
                <div className="max-w-md mx-auto px-5 sm:px-7 py-6 flex flex-col gap-5">
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${sheetId}/edit`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-refined btn-refined--lg w-full justify-center"
                    style={{ backgroundColor: '#0F9D58', borderColor: '#0F9D58', color: '#FFFFFF' }}
                  >
                    Open Google Sheets
                  </a>
                  <p className="text-xs text-txt-tertiary text-center leading-relaxed">
                    Edit conference championship games — one tab per year. Current year is the first tab. Return here and tap Save below.
                  </p>
                  <section>
                    <p className="label-xs text-txt-tertiary mb-3">Save</p>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => handleSyncFromSheet(true)}
                        disabled={syncing || deletingSheet}
                        className="btn-refined btn-refined--solid btn-refined--lg w-full justify-center"
                      >
                        {deletingSheet ? 'Reading…' : 'Save & delete sheet'}
                      </button>
                      <button
                        onClick={() => handleSyncFromSheet(false)}
                        disabled={syncing || deletingSheet}
                        className="btn-refined btn-refined--lg w-full justify-center"
                      >
                        {syncing ? 'Reading…' : 'Save & keep sheet'}
                      </button>
                      <button
                        onClick={handleDeleteSheetOnly}
                        disabled={syncing || deletingSheet}
                        className="btn-refined btn-refined--lg btn-refined--danger w-full justify-center"
                      >
                        {deletingSheet ? 'Deleting…' : 'Delete sheet (no save)'}
                      </button>
                    </div>
                  </section>
                </div>
              </div>
            ) : (
              <>
                <div className="px-5 sm:px-7 py-3 border-b border-surface-4 flex flex-wrap gap-2 items-center">
                  <button
                    onClick={() => handleSyncFromSheet(true)}
                    disabled={syncing || deletingSheet}
                    className="btn-refined btn-refined--solid"
                  >
                    {deletingSheet ? 'Reading…' : 'Save & delete sheet'}
                  </button>
                  <button
                    onClick={() => handleSyncFromSheet(false)}
                    disabled={syncing || deletingSheet}
                    className="btn-refined"
                  >
                    {syncing ? 'Reading…' : 'Save & keep sheet'}
                  </button>
                  <button
                    onClick={handleDeleteSheetOnly}
                    disabled={syncing || deletingSheet}
                    className="btn-refined btn-refined--danger ml-auto"
                  >
                    {deletingSheet ? 'Deleting…' : 'Delete sheet (no save)'}
                  </button>
                </div>
                {embedUrl ? (
                  <div className="flex-1 px-5 sm:px-7 pb-5 pt-3">
                    <div className="h-full rounded-md overflow-hidden border border-surface-4">
                      <iframe
                        title="Conference Championships Sheet"
                        src={embedUrl}
                        className="w-full h-full"
                        style={{ minHeight: 480 }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-txt-tertiary text-sm p-6">
                    Sheet ready.
                    <a
                      href={`https://docs.google.com/spreadsheets/d/${sheetId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 underline text-txt-primary"
                    >
                      Open in Google Sheets
                    </a>
                  </div>
                )}
              </>
            )
          ) : null}
        </div>
      </div>

      <AuthErrorModal
        isOpen={auth.showAuthError}
        onClose={auth.closeAuthError}
        onRefresh={auth.retry}
      />
    </div>,
    document.body,
  )
}
