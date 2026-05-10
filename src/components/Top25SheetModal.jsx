import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  createTop25Sheet,
  readTop25FromSheet,
  refreshTop25SheetData,
  deleteGoogleSheet,
  getSingleSheetEmbedUrl,
} from '../services/sheetsService'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}
import {
  useDynasty,
  applyTop25SheetDiff,
  buildTop25Diff,
  syncGameRanksFromRankByWeek,
  affectedYearWeeksFromTop25Diff,
} from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import SheetLoadingHint from './SheetLoadingHint'
import AuthErrorModal from './AuthErrorModal'
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler'

/**
 * Top25SheetModal — paste-and-sync entry for the Top 25 rankings.
 *
 * One sheet per dynasty, one tab per year. The sheet's stored ID lives
 * on `dynasty.top25SheetId`. On open, we either resume (if the ID's
 * still good) or create a fresh sheet pre-filled from rankByWeek.
 *
 * Save flow:
 *   1. read every "[year] Top 25" tab via readTop25FromSheet
 *   2. compare against the dynasty's current rankByWeek state
 *      (buildTop25Diff)
 *   3. show the user EVERY add / remove / change before applying
 *   4. apply via updateDynasty({ teams: applyTop25SheetDiff(...) })
 *
 * Guardrails:
 *   - if a tab parsed empty AND the dynasty had ≥10 entries for
 *     that year, refuse the save for that year (likely an
 *     accidental Ctrl-A delete)
 *   - if any year's clears (= old entries removed) exceed 30% of
 *     the prior total, the confirmation flags it as a bulk
 *     deletion
 *   - unknown abbreviations (typos / non-dynasty teams) are
 *     surfaced separately so the user can fix them on the sheet
 */
export default function Top25SheetModal({ isOpen, onClose }) {
  const { currentDynasty, updateDynasty, isViewOnly } = useDynasty()
  const { user, signOut, refreshSession } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()

  const [creatingSheet, setCreatingSheet] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [sheetId, setSheetId] = useState(null)
  const [showDeletedNote, setShowDeletedNote] = useState(false)
  const [isMobile, setIsMobile] = useState(isMobileDevice)
  const auth = useAuthErrorHandler()
  const [pendingSave, setPendingSave] = useState(null) // { diff, summary, alsoDelete }
  const creatingSheetRef = useRef(false)
  // Track which sheet IDs have already been refreshed against the
  // current dynasty so we don't re-stomp the user's in-flight edits
  // on re-renders. One refresh per modal-open per sheet is enough —
  // it brings the sheet's pre-fill in sync with the dynasty's current
  // rankByWeek before the user starts editing.
  const refreshedSheetRef = useRef(null)

  // Track mobile breakpoint so we can swap the iframe for an
  // open-in-Sheets CTA — Google's embedded view is unusable in a
  // phone-sized iframe (matches WeeklyScoresModal's mobile fork).
  useEffect(() => {
    const handleResize = () => setIsMobile(isMobileDevice())
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Resume session — pull sheetId off the dynasty if one's stored.
  useEffect(() => {
    if (!isOpen) return
    if (currentDynasty?.top25SheetId && !sheetId && !showDeletedNote) {
      setSheetId(currentDynasty.top25SheetId)
    }
  }, [isOpen, currentDynasty?.top25SheetId, sheetId, showDeletedNote])

  // Refresh the existing sheet's pre-fill from the current dynasty
  // every time the modal opens with a stored sheet. Without this, a
  // sheet created weeks ago shows the rankByWeek picture from THAT
  // moment — every newer entry that landed via weekly-scores saves
  // since then is missing from the sheet, and read-back interprets
  // the gap as "remove these 42 entries." Refresh aligns the sheet
  // with the current dynasty so the diff only contains the user's
  // actual in-modal edits.
  useEffect(() => {
    if (!isOpen || !user || !sheetId || isViewOnly) return
    if (refreshedSheetRef.current === sheetId) return
    refreshedSheetRef.current = sheetId
    refreshTop25SheetData(sheetId, currentDynasty).catch((error) => {
      console.error('Failed to refresh Top 25 sheet pre-fill:', error)
      // Don't surface a toast — the modal still works, just with
      // the slightly-stale pre-fill. Reset the marker so a later
      // open retries the refresh.
      refreshedSheetRef.current = null
    })
  }, [isOpen, user, sheetId, isViewOnly, currentDynasty])

  // Clear the refresh marker on close so the next open triggers a
  // fresh sync.
  useEffect(() => {
    if (!isOpen) refreshedSheetRef.current = null
  }, [isOpen])

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
        const info = await createTop25Sheet(dynastyName, currentDynasty)
        setSheetId(info.spreadsheetId)
        await updateDynasty(currentDynasty.id, { top25SheetId: info.spreadsheetId })
      } catch (error) {
        console.error('Failed to create Top 25 sheet:', error)
        if (!auth.handleError(error)) {
          toast.error('Failed to create the rankings sheet — try again or contact support.')
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
      setPendingSave(null)
    }
  }, [isOpen])

  const handleParseAndPreview = async (alsoDelete) => {
    if (!sheetId || !currentDynasty) return
    setSyncing(true)
    try {
      const result = await readTop25FromSheet(sheetId, currentDynasty)

      // Hard guard: any year tab that came back empty AND had
      // ≥10 stored entries gets refused — almost certainly an
      // accidental delete.
      const refusedYears = []
      for (const [yearStr, totals] of Object.entries(result.yearTotals || {})) {
        if (totals.newCount === 0 && totals.oldCount >= 10) {
          refusedYears.push(yearStr)
        }
      }
      if (refusedYears.length > 0) {
        toast.error(
          `${refusedYears.join(', ')} tab${refusedYears.length === 1 ? '' : 's'} appear${refusedYears.length === 1 ? 's' : ''} empty. Refusing to clear all rankings — re-enter at least one team or close without saving.`,
          { duration: 8000 },
        )
        setSyncing(false)
        return
      }

      const summary = buildTop25Diff(currentDynasty, result.teamUpdates)
      setPendingSave({
        diff: result.teamUpdates,
        summary,
        unknownAbbrs: result.unknownAbbrs || [],
        yearTotals: result.yearTotals,
        alsoDelete: !!alsoDelete,
      })
    } catch (error) {
      console.error('Failed to read Top 25 sheet:', error)
      if (!auth.handleError(error)) {
        toast.error('Failed to read the sheet. Make sure the data is properly formatted and try again.')
      }
    } finally {
      setSyncing(false)
    }
  }

  const handleApplyPendingSave = async () => {
    if (!pendingSave || !currentDynasty) return
    setSyncing(true)
    try {
      const newTeams = applyTop25SheetDiff(currentDynasty, pendingSave.diff)
      // Also sync games[].team1Rank/team2Rank so the Game page and
      // team game-log displays match the corrected rankByWeek picture.
      // Without this, editing a team's Wk N rank via the Top 25 sheet
      // updated rankByWeek but left every Wk N game record showing the
      // old rank — Rankings page showed the correction, Game page and
      // recap text didn't. Beta tester reports of "putting last week's
      // ranking on the game" trace back to this divergence.
      const affectedWeeks = affectedYearWeeksFromTop25Diff(pendingSave.diff)
      const newGames = syncGameRanksFromRankByWeek(
        currentDynasty.games || [],
        newTeams,
        affectedWeeks,
      )
      const updatePayload = { teams: newTeams }
      if (newGames !== (currentDynasty.games || [])) {
        updatePayload.games = newGames
      }
      await updateDynasty(currentDynasty.id, updatePayload)

      const { summary } = pendingSave
      toast.success(
        `Saved Top 25: ${summary.totals.added} added, ${summary.totals.changed} changed, ${summary.totals.removed} removed.`,
      )

      if (pendingSave.alsoDelete) {
        try { await deleteGoogleSheet(sheetId) } catch (e) { console.error('Failed to delete sheet:', e) }
        await updateDynasty(currentDynasty.id, { top25SheetId: null })
        setSheetId(null)
        setShowDeletedNote(true)
        setTimeout(() => onClose(), 1800)
      } else {
        setPendingSave(null)
      }
    } catch (error) {
      console.error('Failed to apply Top 25 changes:', error)
      if (!auth.handleError(error)) {
        toast.error('Failed to save changes — try again.')
      }
    } finally {
      setSyncing(false)
    }
  }

  const handleDeleteSheetOnly = async () => {
    if (!sheetId || !currentDynasty) return
    const ok = await confirm({
      title: 'Delete this rankings sheet?',
      message: 'This deletes the Google Sheet without applying any edits. Your dynasty rankings stay as-is.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    setDeletingSheet(true)
    try {
      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { top25SheetId: null })
      setSheetId(null)
      setShowDeletedNote(true)
      setTimeout(() => onClose(), 1800)
    } catch (error) {
      console.error('Failed to delete sheet:', error)
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
            <span className="label-xs text-txt-tertiary">Rankings</span>
            <h2 className="text-xl sm:text-2xl font-bold text-txt-primary tracking-tight">Top 25</h2>
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
                <div className="animate-spin w-10 h-10 border-2 rounded-full mx-auto mb-4" style={{ borderColor: 'var(--text-primary)', borderTopColor: 'transparent' }} />
                <p className="label-xs text-txt-tertiary mb-2">Creating Sheet</p>
                <p className="text-base font-semibold text-txt-primary">Top 25 workspace</p>
                <p className="text-xs mt-2 text-txt-tertiary">One tab per dynasty year, pre-filled from current rankings.</p>
                <SheetLoadingHint active={creatingSheet} />
              </div>
            </div>
          ) : showDeletedNote ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center max-w-sm">
                <p className="label-xs text-txt-tertiary mb-2">Status</p>
                <p className="text-xl font-bold text-txt-primary mb-1">Saved</p>
                <p className="text-sm text-txt-secondary">Rankings updated. Sheet moved to Drive trash.</p>
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
                    Edit your Top 25 by week in Google Sheets, then return here and tap Save below.
                  </p>
                  <section>
                    <p className="label-xs text-txt-tertiary mb-3">Save</p>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => handleParseAndPreview(true)}
                        disabled={syncing || deletingSheet}
                        className="btn-refined btn-refined--solid btn-refined--lg w-full justify-center"
                      >
                        {syncing ? 'Reading…' : 'Save & delete sheet'}
                      </button>
                      <button
                        onClick={() => handleParseAndPreview(false)}
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
                    onClick={() => handleParseAndPreview(true)}
                    disabled={syncing || deletingSheet}
                    className="btn-refined btn-refined--solid"
                  >
                    {syncing ? 'Reading…' : 'Save & delete sheet'}
                  </button>
                  <button
                    onClick={() => handleParseAndPreview(false)}
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
                        title="Top 25 Sheet"
                        src={embedUrl}
                        className="w-full h-full"
                        style={{ minHeight: 480 }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-txt-tertiary text-sm p-6">
                    Sheet ready. <a href={`https://docs.google.com/spreadsheets/d/${sheetId}`} target="_blank" rel="noopener noreferrer" className="ml-2 underline text-txt-primary">Open in Google Sheets</a>
                  </div>
                )}
              </>
            )
          ) : null}
        </div>
      </div>

      {pendingSave && (
        <Top25DiffConfirmModal
          summary={pendingSave.summary}
          yearTotals={pendingSave.yearTotals}
          unknownAbbrs={pendingSave.unknownAbbrs}
          alsoDelete={pendingSave.alsoDelete}
          onCancel={() => setPendingSave(null)}
          onConfirm={handleApplyPendingSave}
          applying={syncing}
        />
      )}
      <AuthErrorModal
        isOpen={auth.showAuthError}
        onClose={auth.closeAuthError}
        onRefresh={auth.retry}
      />
    </div>,
    document.body,
  )
}

// Confirmation modal — shows every add / change / remove the user is
// about to commit, plus any unknown abbrs (typos) the parser couldn't
// resolve. The user clicks Confirm to apply or Cancel to bail.
function Top25DiffConfirmModal({ summary, yearTotals, unknownAbbrs, alsoDelete, onCancel, onConfirm, applying }) {
  const weekLabel = (w) => {
    if (w === 0) return 'Preseason'
    if (w === 100) return 'CC'
    if (w === 101) return 'CFP-1'
    if (w === 102) return 'CFP-Q'
    if (w === 103) return 'CFP-S'
    if (w === 104) return 'Natty'
    return `Wk ${w}`
  }

  const orderedYears = useMemo(() => Object.keys(summary.byYear || {}).sort((a, b) => Number(b) - Number(a)), [summary])

  // Bulk-delete flag: any year where >30% of old entries are being removed.
  const bulkDeleteFlags = useMemo(() => {
    const flags = []
    for (const [yearStr, totals] of Object.entries(yearTotals || {})) {
      if (totals.oldCount === 0) continue
      const removedHere = (summary.byYear?.[yearStr]?.removed?.length) || 0
      if (removedHere / totals.oldCount > 0.3) {
        flags.push({ year: yearStr, removedHere, oldCount: totals.oldCount })
      }
    }
    return flags
  }, [summary, yearTotals])

  const noChanges = summary.totals.added === 0 && summary.totals.changed === 0 && summary.totals.removed === 0

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[10000] p-4"
      style={{ margin: 0 }}
      onMouseDown={onCancel}
    >
      <div
        className="card-elevated w-full max-w-2xl max-h-[85dvh] flex flex-col overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-4">
          <h3 className="text-xl font-bold text-txt-primary">Confirm Rankings Save</h3>
          <button onClick={onCancel} aria-label="Close" className="text-txt-tertiary hover:text-txt-primary">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm text-txt-secondary">
          <div className="text-txt-primary">
            <span className="font-semibold">{summary.totals.added}</span> added, {' '}
            <span className="font-semibold">{summary.totals.changed}</span> changed, {' '}
            <span className="font-semibold">{summary.totals.removed}</span> removed
            {alsoDelete ? ' • sheet will be deleted after save' : ' • sheet kept open'}
          </div>

          {bulkDeleteFlags.length > 0 && (
            <div className="rounded-lg p-3 border border-surface-4" style={{ backgroundColor: 'rgba(220, 38, 38, 0.08)' }}>
              <p className="text-txt-primary font-semibold mb-1">Heads up — large deletion</p>
              <ul className="list-disc list-inside text-xs">
                {bulkDeleteFlags.map(f => (
                  <li key={f.year}>
                    {f.year}: clearing {f.removedHere} of {f.oldCount} existing entries
                  </li>
                ))}
              </ul>
              <p className="text-xs mt-1.5">If this isn't what you intended, cancel and re-fill the sheet first.</p>
            </div>
          )}

          {unknownAbbrs?.length > 0 && (
            <div className="rounded-lg p-3 border border-surface-4" style={{ backgroundColor: 'rgba(245, 158, 11, 0.08)' }}>
              <p className="text-txt-primary font-semibold mb-1">Unknown team abbreviations (skipped)</p>
              <ul className="list-disc list-inside text-xs space-y-0.5">
                {unknownAbbrs.slice(0, 12).map((u, i) => (
                  <li key={i}>{u.year} {weekLabel(u.weekKey)} #{u.rank}: <span className="font-mono">{u.raw}</span></li>
                ))}
                {unknownAbbrs.length > 12 && <li className="opacity-70">…and {unknownAbbrs.length - 12} more</li>}
              </ul>
              <p className="text-xs mt-1.5">These cells were ignored. Fix the abbreviations on the sheet and re-save to include them.</p>
            </div>
          )}

          {noChanges ? (
            <div className="text-txt-tertiary italic">No changes to apply — the sheet matches the dynasty's current state.</div>
          ) : (
            orderedYears.map(year => {
              const y = summary.byYear[year]
              if (!y || (y.added.length + y.changed.length + y.removed.length === 0)) return null
              return (
                <div key={year} className="rounded-lg border border-surface-4 overflow-hidden">
                  <div className="px-3 py-2 font-semibold text-txt-primary bg-surface-2">{year}</div>
                  <div className="divide-y divide-surface-4">
                    {y.added.length > 0 && (
                      <DiffSection label="Added" tone="add" items={y.added.map(e => `${weekLabel(e.weekKey)} #${e.rank}: ${e.abbr}`)} />
                    )}
                    {y.changed.length > 0 && (
                      <DiffSection label="Changed" tone="change" items={y.changed.map(e => `${weekLabel(e.weekKey)} #${e.newRank}: ${e.abbr} (was #${e.oldRank})`)} />
                    )}
                    {y.removed.length > 0 && (
                      <DiffSection label="Removed" tone="remove" items={y.removed.map(e => `${weekLabel(e.weekKey)} #${e.rank}: ${e.abbr}`)} />
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="px-5 py-4 border-t border-surface-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={applying}
            className="px-4 py-2 rounded-lg text-sm font-semibold border border-surface-4 hover:bg-surface-2 disabled:opacity-60 text-txt-primary"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={applying || noChanges}
            className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60"
            style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-0)' }}
          >
            {applying ? 'Applying…' : (noChanges ? 'Nothing to Save' : 'Confirm & Save')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function DiffSection({ label, tone, items }) {
  const dotColor = tone === 'add' ? 'rgb(16, 185, 129)' : tone === 'remove' ? 'rgb(239, 68, 68)' : 'rgb(234, 179, 8)'
  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dotColor }} />
        <span className="text-xs uppercase font-bold text-txt-tertiary tracking-wider">{label}</span>
        <span className="text-xs text-txt-tertiary">({items.length})</span>
      </div>
      <ul className="text-xs space-y-0.5 ml-4 list-disc list-inside text-txt-secondary">
        {items.slice(0, 30).map((s, i) => <li key={i}>{s}</li>)}
        {items.length > 30 && <li className="opacity-70">…and {items.length - 30} more</li>}
      </ul>
    </div>
  )
}
