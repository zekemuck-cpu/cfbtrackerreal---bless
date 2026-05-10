import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty } from '../context/DynastyContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import SheetModalHeader from './ui/SheetModalHeader'
import { useAuth } from '../context/AuthContext'
import { teams as TEAM_NAMES, getMascotName } from '../data/teams'
import { getTidFromTeamName, TEAMS } from '../data/teamRegistry'
import SearchableSelect from './SearchableSelect'
import AIPromptModal from './AIPromptModal'
import { buildPreseasonTop25Prompt } from '../utils/recapPrompts'
import {
  createPreseasonRankingsSheet,
  readPreseasonRankingsFromSheet,
  deleteGoogleSheet,
  getSingleSheetEmbedUrl,
} from '../services/sheetsService'
import SheetLoadingHint from './SheetLoadingHint'

/**
 * Preseason Top 25 entry modal.
 *
 * Saves to dynasty.preseasonRankingsByYear[year] as an array of
 * { rank, team (abbr), tid } objects — same shape used by the recap prompt
 * builders so the saved poll automatically flows into the preseason recap.
 *
 * The "Suggest with AI" button opens AIPromptModal with a prompt that
 * grounds the AI in the dynasty's prior-season final-poll data; the user
 * pastes the AI's TSV output back into the form rows manually.
 */
export default function PreseasonTop25Modal({ isOpen, onClose, year, teamColors }) {
  const { currentDynasty, updateDynasty, isViewOnly } = useDynasty()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const { user } = useAuth()
  const yearNum = Number(year)

  // Google Sheet flow state — separate from the manual entry form.
  const [showSheet, setShowSheet] = useState(false)
  const [sheetId, setSheetId] = useState(null)
  const [creatingSheet, setCreatingSheet] = useState(false)
  const [syncingSheet, setSyncingSheet] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const creatingSheetRef = useRef(false)

  // Load existing saved rankings (so re-opening lets the user edit).
  const existing = currentDynasty?.preseasonRankingsByYear?.[yearNum] || []
  const initialRows = useMemo(() => {
    const byRank = {}
    for (const e of existing) {
      if (e?.rank >= 1 && e.rank <= 25) byRank[e.rank] = e
    }
    return Array.from({ length: 25 }, (_, i) => {
      const rank = i + 1
      const e = byRank[rank]
      const teamName = e?.tid != null
        ? (currentDynasty?.teams?.[e.tid]?.name || TEAMS[e.tid]?.name || '')
        : (e?.team ? getMascotName(e.team, currentDynasty?.teams) || '' : '')
      return { rank, teamName }
    })
  }, [existing, currentDynasty?.teams, isOpen])

  const [rows, setRows] = useState(initialRows)
  const [showAIPrompt, setShowAIPrompt] = useState(false)
  const [saving, setSaving] = useState(false)

  // Reset rows ONLY when the modal opens — not on every render. The
  // previous version listed `initialRows` in the dep array, but
  // initialRows is recomputed every render (because `existing` is a
  // fresh `?.[year] || []` array reference each time). That made the
  // effect fire after every keystroke and reset the user's picks
  // immediately — which presented as "the modal won't let me enter
  // anything." isOpen-only ensures we only seed state on the open
  // transition.
  useEffect(() => {
    if (isOpen) setRows(initialRows)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const aiPrompt = useMemo(() => {
    if (!currentDynasty) return ''
    return buildPreseasonTop25Prompt(currentDynasty, yearNum)
  }, [currentDynasty, yearNum])

  // Build the team option list. Prefer dynasty teams (carries teambuilder
  // names) and fall back to the static mascot list.
  const teamOptions = useMemo(() => {
    const dynastyTeamNames = currentDynasty?.teams
      ? Object.values(currentDynasty.teams).map(t => t.name).filter(Boolean)
      : []
    if (dynastyTeamNames.length > 0) return [...new Set(dynastyTeamNames)].sort()
    return [...TEAM_NAMES].sort()
  }, [currentDynasty?.teams])

  const updateRow = (index, teamName) => {
    setRows(prev => {
      const next = [...prev]
      next[index] = { ...next[index], teamName }
      return next
    })
  }

  const handleClear = () => {
    if (!window.confirm('Clear all 25 ranks?')) return
    setRows(Array.from({ length: 25 }, (_, i) => ({ rank: i + 1, teamName: '' })))
  }

  // Shared persist logic — used by both the manual-entry form and the
  // Google Sheet sync flow. Writes both:
  //   1. dynasty.preseasonRankingsByYear[year] (existing store; powers
  //      the preseason recap prompt)
  //   2. each ranked team's dynasty.teams[tid].byYear[year].rankByWeek[0]
  //      (the Top 25 page reads this — labels week 0 as "Preseason
  //      Rankings")
  // Both are updated atomically so the Top 25 page and the recap
  // prompt stay in sync.
  const persistEntries = async (entries) => {
    if (!currentDynasty) return
    const cur = currentDynasty.preseasonRankingsByYear || {}
    const nextPolls = { ...cur, [yearNum]: entries }

    // Build the teams update — for every team in the new poll, set
    // rankByWeek[0] to that team's rank. Also clear rankByWeek[0]
    // for any team whose tid USED to be in the prior preseason poll
    // but isn't anymore (so removing a team from the poll also
    // removes their preseason rank from the Top 25 page).
    const teamsCopy = { ...(currentDynasty.teams || {}) }
    const yearKey = String(yearNum)
    const writeRank = (tid, rank) => {
      if (tid == null) return
      const tidKey = String(tid)
      const team = teamsCopy[tidKey] || teamsCopy[tid] || {}
      const byYear = { ...(team.byYear || {}) }
      const yearEntry = { ...(byYear[yearKey] || byYear[yearNum] || {}) }
      const rankByWeek = { ...(yearEntry.rankByWeek || {}) }
      if (rank == null) {
        delete rankByWeek[0]
        delete rankByWeek['0']
      } else {
        rankByWeek[0] = rank
      }
      yearEntry.rankByWeek = rankByWeek
      byYear[yearKey] = yearEntry
      teamsCopy[tidKey] = { ...team, byYear }
    }
    // Clear week-0 rank for tids that were in the OLD poll but aren't
    // in the new one.
    const oldEntries = cur[yearNum] || cur[String(yearNum)] || []
    const newTids = new Set(entries.map(e => e.tid).filter(t => t != null))
    for (const oe of oldEntries) {
      if (oe?.tid != null && !newTids.has(Number(oe.tid))) writeRank(Number(oe.tid), null)
    }
    // Set week-0 rank for every team in the new poll.
    for (const e of entries) {
      if (e.tid != null) writeRank(Number(e.tid), e.rank)
    }

    await updateDynasty(currentDynasty.id, {
      preseasonRankingsByYear: nextPolls,
      teams: teamsCopy,
    })
  }

  const handleSave = async () => {
    if (isViewOnly) {
      toast.error('Read-only mode — cannot save.')
      return
    }
    if (!currentDynasty) return
    // Persist only filled rows; rank order preserved.
    const entries = rows
      .filter(r => r.teamName)
      .map(r => {
        const tid = getTidFromTeamName(r.teamName, currentDynasty?.teams)
        // Resolve to an abbreviation when we have one — abbr is what
        // legacy paths expect; tid is the canonical id going forward.
        const team = tid != null
          ? (currentDynasty?.teams?.[tid]?.abbr || TEAMS[tid]?.abbr || r.teamName)
          : r.teamName
        return { rank: r.rank, team, tid: tid != null ? Number(tid) : null }
      })
    if (entries.length === 0) {
      toast.error('Add at least one ranked team.')
      return
    }
    setSaving(true)
    try {
      await persistEntries(entries)
      toast.success(`Preseason Top ${entries.length} saved.`)
      onClose?.()
    } catch (err) {
      console.error('[PreseasonTop25Modal] save failed:', err)
      toast.error('Could not save preseason rankings.')
    } finally {
      setSaving(false)
    }
  }

  // ─── Google Sheet flow ───────────────────────────────────────────
  // Resume a previously-created sheet, or build one on first open of
  // the sheet view. Stored on dynasty.preseasonRankingsSheetIdByYear.
  useEffect(() => {
    if (!showSheet) return
    const stored = currentDynasty?.preseasonRankingsSheetIdByYear?.[yearNum]
    if (stored && !sheetId) setSheetId(stored)
  }, [showSheet, currentDynasty?.preseasonRankingsSheetIdByYear, yearNum, sheetId])

  useEffect(() => {
    if (!showSheet || !user || sheetId || creatingSheet || creatingSheetRef.current) return
    if (!currentDynasty?.id || isViewOnly) return
    const create = async () => {
      creatingSheetRef.current = true
      setCreatingSheet(true)
      try {
        const dynastyName = currentDynasty.dynastyName || currentDynasty.teamName || 'Dynasty'
        const info = await createPreseasonRankingsSheet(dynastyName, yearNum, currentDynasty)
        setSheetId(info.spreadsheetId)
        const cur = currentDynasty.preseasonRankingsSheetIdByYear || {}
        await updateDynasty(currentDynasty.id, {
          preseasonRankingsSheetIdByYear: { ...cur, [yearNum]: info.spreadsheetId },
        })
      } catch (error) {
        console.error('[PreseasonTop25Modal] sheet create failed:', error)
        toast.error('Failed to create the rankings sheet — try again.')
      } finally {
        setCreatingSheet(false)
        creatingSheetRef.current = false
      }
    }
    create()
  }, [showSheet, user, sheetId, creatingSheet, currentDynasty?.id, isViewOnly, yearNum])

  const handleSheetSync = async (alsoDelete) => {
    if (!sheetId || !currentDynasty) return
    setSyncingSheet(true)
    try {
      const result = await readPreseasonRankingsFromSheet(sheetId, currentDynasty, yearNum)

      // Empty-sheet guardrail — refuse if zero entries AND prior
      // poll had data. Almost always indicates an accidental delete.
      const oldCount = (currentDynasty.preseasonRankingsByYear?.[yearNum] || []).length
      if (result.entries.length === 0 && oldCount >= 5) {
        toast.error(`Sheet appears empty. Refusing to clear ${oldCount} ranked teams — re-enter at least one and try again.`, { duration: 8000 })
        setSyncingSheet(false)
        return
      }
      // Confirm bulk-delete if removing >30% of prior entries.
      const removed = oldCount - result.entries.length
      if (oldCount > 0 && removed / Math.max(1, oldCount) > 0.3) {
        const ok = await confirm({
          title: 'Save preseason rankings?',
          message: `This will reduce the preseason poll from ${oldCount} to ${result.entries.length} ranked team${result.entries.length === 1 ? '' : 's'}. Continue?`,
          confirmLabel: 'Save',
          variant: 'danger',
        })
        if (!ok) { setSyncingSheet(false); return }
      }
      // Surface unknown abbrs (typos / non-dynasty teams). They get
      // skipped — the strict-dropdown should prevent this normally.
      if (result.unknownAbbrs?.length > 0) {
        toast.error(
          `Skipped ${result.unknownAbbrs.length} unknown abbreviation${result.unknownAbbrs.length === 1 ? '' : 's'}: ${result.unknownAbbrs.slice(0, 3).map(u => u.raw).join(', ')}${result.unknownAbbrs.length > 3 ? '…' : ''}`,
          { duration: 8000 },
        )
      }

      const entries = result.entries.map(e => ({ rank: e.rank, team: e.abbr, tid: e.tid }))
      if (entries.length === 0) {
        toast.error('No ranked teams found in the sheet.')
        setSyncingSheet(false)
        return
      }
      await persistEntries(entries)
      toast.success(`Saved Preseason Top ${entries.length}.`)

      if (alsoDelete) {
        try { await deleteGoogleSheet(sheetId) } catch (e) { console.error('[PreseasonTop25Modal] delete failed:', e) }
        const cur = currentDynasty.preseasonRankingsSheetIdByYear || {}
        const next = { ...cur }
        delete next[yearNum]
        await updateDynasty(currentDynasty.id, { preseasonRankingsSheetIdByYear: next })
        setSheetId(null)
      }
      onClose?.()
    } catch (error) {
      console.error('[PreseasonTop25Modal] sheet sync failed:', error)
      toast.error('Failed to read the sheet — try again.')
    } finally {
      setSyncingSheet(false)
    }
  }

  const handleDeleteSheetOnly = async () => {
    if (!sheetId || !currentDynasty) return
    const ok = await confirm({
      title: 'Delete this sheet?',
      message: 'Deletes the Google Sheet without saving any edits. Your preseason rankings stay as-is.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    setDeletingSheet(true)
    try {
      await deleteGoogleSheet(sheetId)
      const cur = currentDynasty.preseasonRankingsSheetIdByYear || {}
      const next = { ...cur }
      delete next[yearNum]
      await updateDynasty(currentDynasty.id, { preseasonRankingsSheetIdByYear: next })
      setSheetId(null)
      setShowSheet(false)
    } catch (error) {
      console.error('[PreseasonTop25Modal] sheet delete failed:', error)
      toast.error('Failed to delete the sheet — try again.')
    } finally {
      setDeletingSheet(false)
    }
  }

  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4 modal-backdrop-in"
      style={{ margin: 0 }}
      onMouseDown={onClose}
    >
      <div
        className="card-elevated w-full sm:w-[min(880px,95vw)] max-h-[calc(100dvh-4rem)] sm:max-h-[88vh] flex flex-col overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <SheetModalHeader eyebrow="Preseason" title={`${yearNum} Top 25`} onClose={onClose} />

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5">
          {showSheet ? (
            // Google Sheet entry mode — the user pastes / types directly
            // into the sheet, then clicks Save & Sync to pull it back.
            creatingSheet ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="animate-spin w-12 h-12 border-4 rounded-full mx-auto mb-4" style={{ borderColor: 'var(--text-primary)', borderTopColor: 'transparent' }} />
                  <p className="text-lg font-semibold text-txt-primary">Creating Preseason Sheet…</p>
                  <p className="text-sm mt-2 text-txt-secondary">Single-tab, 25 ranks, strict-dropdown team validation.</p>
                  <SheetLoadingHint active={creatingSheet} />
                </div>
              </div>
            ) : sheetId ? (
              <div className="space-y-3">
                <div className="text-xs text-txt-tertiary">
                  Edit ranks in the sheet below — column B uses a strict team dropdown (every team in this dynasty). Use the AI Prompt button to automate from a screenshot. Save & Sync to pull the entries back into your dynasty.
                </div>
                <iframe
                  title="Preseason Rankings Sheet"
                  src={getSingleSheetEmbedUrl(sheetId)}
                  className="w-full rounded-lg border border-surface-4"
                  style={{ minHeight: 460, height: '52vh' }}
                />
              </div>
            ) : (
              <div className="text-center py-8 text-txt-tertiary text-sm">Sheet not loaded.</div>
            )
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2">
              {rows.map((row, index) => (
                <div key={row.rank} className="flex items-center gap-3">
                  <div className="w-9 text-right tabular-nums font-display font-bold text-txt-secondary text-sm flex-shrink-0">
                    #{row.rank}
                  </div>
                  <div className="flex-1 min-w-0">
                    <SearchableSelect
                      options={teamOptions}
                      value={row.teamName}
                      onChange={(v) => updateRow(index, v)}
                      placeholder="Pick team…"
                      teamColors={teamColors}
                      dynastyTeams={currentDynasty?.teams}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-surface-4 px-5 sm:px-6 py-4 flex flex-col-reverse sm:flex-row gap-2 sm:items-center sm:justify-between">
          <div className="flex gap-2">
            {showSheet ? (
              <button
                onClick={() => setShowSheet(false)}
                disabled={syncingSheet || deletingSheet}
                className="text-xs text-txt-tertiary hover:text-txt-primary transition-colors disabled:opacity-50"
              >
                ← Back to Form
              </button>
            ) : (
              <button
                onClick={handleClear}
                disabled={saving || isViewOnly}
                className="text-xs text-txt-tertiary hover:text-red-400 transition-colors disabled:opacity-50"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="flex gap-2 items-stretch sm:items-center sm:justify-end flex-wrap">
            <button
              onClick={() => setShowAIPrompt(true)}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent"
            >
              AI Prompt
            </button>
            {showSheet ? (
              <>
                <button
                  onClick={handleDeleteSheetOnly}
                  disabled={syncingSheet || deletingSheet || !sheetId}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent disabled:opacity-50"
                >
                  {deletingSheet ? 'Deleting…' : 'Delete Sheet (No Save)'}
                </button>
                <button
                  onClick={() => handleSheetSync(false)}
                  disabled={syncingSheet || deletingSheet || !sheetId || isViewOnly}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-surface-4 text-txt-primary hover:bg-surface-2 transition-colors disabled:opacity-50"
                >
                  {syncingSheet ? 'Syncing…' : 'Save (Keep Sheet)'}
                </button>
                <button
                  onClick={() => handleSheetSync(true)}
                  disabled={syncingSheet || deletingSheet || !sheetId || isViewOnly}
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
                  style={{ backgroundColor: teamColors?.primary || 'var(--text-primary)', color: '#fff' }}
                >
                  {syncingSheet ? 'Syncing…' : 'Save & Sync'}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setShowSheet(true)}
                  disabled={isViewOnly}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent disabled:opacity-50"
                >
                  Google Sheet
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent"
                >
                  Close
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || isViewOnly}
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
                  style={{ backgroundColor: teamColors?.primary || 'var(--text-primary)', color: '#fff' }}
                >
                  {saving ? 'Saving…' : 'Save Top 25'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <AIPromptModal
        isOpen={showAIPrompt}
        onClose={() => setShowAIPrompt(false)}
        title={`${yearNum} Preseason Top 25`}
        prompt={aiPrompt}
        pasteTarget={showSheet
          ? 'Paste at cell B2 of the sheet (one team abbr per row)'
          : 'Paste each abbreviation into the matching #N row above'}
      />
    </div>,
    document.body,
  )
}
