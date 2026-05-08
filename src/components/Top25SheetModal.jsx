import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  createTop25Sheet,
  readTop25FromSheet,
  deleteGoogleSheet,
  getSingleSheetEmbedUrl,
} from '../services/sheetsService'
import { useDynasty, applyTop25SheetDiff, buildTop25Diff } from '../context/DynastyContext'
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
  const auth = useAuthErrorHandler()
  const [pendingSave, setPendingSave] = useState(null) // { diff, summary, alsoDelete }
  const creatingSheetRef = useRef(false)

  // Resume session — pull sheetId off the dynasty if one's stored.
  useEffect(() => {
    if (!isOpen) return
    if (currentDynasty?.top25SheetId && !sheetId && !showDeletedNote) {
      setSheetId(currentDynasty.top25SheetId)
    }
  }, [isOpen, currentDynasty?.top25SheetId, sheetId, showDeletedNote])

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
      await updateDynasty(currentDynasty.id, { teams: newTeams })

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
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={onClose}
    >
      <div
        className="card-elevated w-full sm:w-[95vw] max-h-[calc(100dvh-4rem)] sm:h-[95dvh] flex flex-col overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-surface-4">
          <h2 className="text-2xl font-bold text-txt-primary">Top 25 Rankings</h2>
          <button
            aria-label="Close"
            onClick={onClose}
            className="text-txt-tertiary hover:text-txt-primary transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">
          {creatingSheet ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin w-12 h-12 border-4 rounded-full mx-auto mb-4" style={{ borderColor: 'var(--text-primary)', borderTopColor: 'transparent' }} />
                <p className="text-lg font-semibold text-txt-primary">Creating Top 25 Sheet...</p>
                <p className="text-sm mt-2 text-txt-secondary">One tab per dynasty year, pre-filled from current rankings.</p>
                <SheetLoadingHint active={creatingSheet} />
              </div>
            </div>
          ) : showDeletedNote ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="card p-8 border-l-[3px] text-center max-w-sm" style={{ borderLeftColor: 'var(--surface-5)' }}>
                <p className="label-xs text-txt-tertiary mb-2">Status</p>
                <p className="text-xl font-bold text-txt-primary mb-2">Saved &amp; Moved to Trash</p>
                <p className="text-sm text-txt-secondary">Rankings updated in your dynasty.</p>
              </div>
            </div>
          ) : sheetId ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="mb-3 flex flex-wrap gap-2 sm:gap-3 items-center">
                <button
                  onClick={() => handleParseAndPreview(true)}
                  disabled={syncing || deletingSheet}
                  className="px-3 sm:px-4 py-2 rounded-lg font-semibold text-xs sm:text-sm disabled:opacity-60 transition-colors"
                  style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-0)' }}
                >
                  {syncing ? 'Reading…' : 'Save & Delete Sheet'}
                </button>
                <button
                  onClick={() => handleParseAndPreview(false)}
                  disabled={syncing || deletingSheet}
                  className="px-3 sm:px-4 py-2 rounded-lg font-semibold text-xs sm:text-sm disabled:opacity-60 transition-colors border border-surface-4 hover:bg-surface-2 text-txt-primary"
                >
                  {syncing ? 'Reading…' : 'Save (Keep Sheet)'}
                </button>
                <button
                  onClick={handleDeleteSheetOnly}
                  disabled={syncing || deletingSheet}
                  className="px-3 sm:px-4 py-2 rounded-lg font-semibold text-xs sm:text-sm disabled:opacity-60 transition-colors border border-surface-4 hover:bg-surface-2 text-txt-secondary ml-auto"
                >
                  {deletingSheet ? 'Deleting…' : 'Delete Sheet (No Save)'}
                </button>
              </div>

              {embedUrl ? (
                <div className="flex-1 rounded-lg overflow-hidden border border-surface-4">
                  <iframe
                    title="Top 25 Sheet"
                    src={embedUrl}
                    className="w-full h-full"
                    style={{ minHeight: 480 }}
                  />
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-txt-tertiary text-sm">
                  Sheet ready. Open it in Google Sheets to edit:
                  <a href={`https://docs.google.com/spreadsheets/d/${sheetId}`} target="_blank" rel="noopener noreferrer" className="ml-2 underline text-txt-primary">Open</a>
                </div>
              )}
            </div>
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
