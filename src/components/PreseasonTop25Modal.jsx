import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty } from '../context/DynastyContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import SheetModalHeader from './ui/SheetModalHeader'
import SheetModalAIHero from './ui/SheetModalAIHero'
import SheetManualEntry from './ui/SheetManualEntry'
import SheetModalFooter from './ui/SheetModalFooter'
import SheetToolbar from './SheetToolbar'
import { useAuth } from '../context/AuthContext'
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler'
import AuthErrorModal from './AuthErrorModal'
import { buildAIPrompt } from '../utils/aiPrompt'
import {
  createPreseasonRankingsSheet,
  readPreseasonRankingsFromSheet,
  deleteGoogleSheet,
  getSingleSheetEmbedUrl,
} from '../services/sheetsService'
import SheetLoadingHint from './SheetLoadingHint'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function PreseasonTop25Modal({ isOpen, onClose, year, teamColors }) {
  const { currentDynasty, updateDynasty, isViewOnly } = useDynasty()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const { user } = useAuth()
  const auth = useAuthErrorHandler()
  const yearNum = Number(year)

  const [sheetId, setSheetId] = useState(null)
  const [creatingSheet, setCreatingSheet] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [useEmbedded, setUseEmbedded] = useState(() =>
    localStorage.getItem('sheetEmbedPreference') === 'true'
  )
  const [highlightSave, setHighlightSave] = useState(false)
  const creatingSheetRef = useRef(false)

  useEffect(() => {
    setIsMobile(isMobileDevice())
    const handleResize = () => setIsMobile(isMobileDevice())
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Resume stored sheet or create fresh one on open
  useEffect(() => {
    if (!isOpen) {
      setSheetId(null)
      creatingSheetRef.current = false
      return
    }
    const stored = currentDynasty?.preseasonRankingsSheetIdByYear?.[yearNum]
    if (stored) { setSheetId(stored); return }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !user || sheetId || creatingSheet || creatingSheetRef.current || isViewOnly) return
    const create = async () => {
      creatingSheetRef.current = true
      setCreatingSheet(true)
      try {
        const dynastyName = currentDynasty?.dynastyName || currentDynasty?.teamName || 'Dynasty'
        const info = await createPreseasonRankingsSheet(dynastyName, yearNum, currentDynasty)
        setSheetId(info.spreadsheetId)
        const cur = currentDynasty?.preseasonRankingsSheetIdByYear || {}
        await updateDynasty(currentDynasty.id, {
          preseasonRankingsSheetIdByYear: { ...cur, [yearNum]: info.spreadsheetId },
        })
      } catch (error) {
        console.error('[PreseasonTop25Modal] sheet create failed:', error)
        if (!auth.handleError(error)) {
          toast.error('Failed to create the rankings sheet — try again.')
        }
      } finally {
        setCreatingSheet(false)
        creatingSheetRef.current = false
      }
    }
    create()
  }, [isOpen, user, sheetId, creatingSheet, currentDynasty?.id, isViewOnly, auth.retryCount])

  useEffect(() => {
    if (!isOpen || !sheetId || useEmbedded) return
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') { setHighlightSave(true); setTimeout(() => setHighlightSave(false), 5000) }
    }
    const handleFocus = () => { setHighlightSave(true); setTimeout(() => setHighlightSave(false), 5000) }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleFocus)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleFocus)
    }
  }, [isOpen, sheetId, useEmbedded])

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${yearNum} Preseason Top 25`,
    structure: `This sheet has ONE tab named "${yearNum} Preseason Top 25". 2 columns, 26 rows: row 1 is a protected header, rows 2-26 are ranks 1-25.

Column A (rank number 1-25) is PRE-FILLED — you never output it.
You fill column B (Top 25 team for that rank).

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Output ONLY column B (one team abbreviation per line). NEVER output column A (rank), the header row, or any rank labels.
2. Row order is FIXED: rank 1 first, rank 25 last. EXACTLY 25 lines of output.
3. Each line has EXACTLY 1 field: <Team abbreviation>
4. Team values must be UPPERCASE abbreviations from the mapping at the bottom — NEVER full names or nicknames.
5. NO COMMAS. No commentary INSIDE the data. No rank numbers. No header row. No tabs. The paste-target label above the fence is required (see Method A/B rules above).
6. Each team abbreviation must appear AT MOST ONCE across all 25 ranks — no duplicates in the poll.
7. BLANK line for unknown ranks (just an empty line). Never guess.
8. ONE block, preceded by the required paste-target label line above the fence (see Method A/B rules above).

═══════════════════════════════════════════════════════════
TAB "${yearNum} Preseason Top 25" — 25 rows × 1 output column
Paste at cell B2 of the "${yearNum} Preseason Top 25" tab
═══════════════════════════════════════════════════════════

Sheet Row | Col A (PROTECTED, DO NOT OUTPUT) | Your output: Top 25 team
----------+----------------------------------+-------------------------
    2     | 1                                | <Rank 1 team>
    3     | 2                                | <Rank 2 team>
    4     | 3                                | <Rank 3 team>
    5     | 4                                | <Rank 4 team>
    6     | 5                                | <Rank 5 team>
    7     | 6                                | <Rank 6 team>
    8     | 7                                | <Rank 7 team>
    9     | 8                                | <Rank 8 team>
   10     | 9                                | <Rank 9 team>
   11     | 10                               | <Rank 10 team>
   12     | 11                               | <Rank 11 team>
   13     | 12                               | <Rank 12 team>
   14     | 13                               | <Rank 13 team>
   15     | 14                               | <Rank 14 team>
   16     | 15                               | <Rank 15 team>
   17     | 16                               | <Rank 16 team>
   18     | 17                               | <Rank 17 team>
   19     | 18                               | <Rank 18 team>
   20     | 19                               | <Rank 19 team>
   21     | 20                               | <Rank 20 team>
   22     | 21                               | <Rank 21 team>
   23     | 22                               | <Rank 22 team>
   24     | 23                               | <Rank 23 team>
   25     | 24                               | <Rank 24 team>
   26     | 25                               | <Rank 25 team>`,
    includeTeamMap: true,
    dynastyTeams: currentDynasty?.teams,
  }), [yearNum, currentDynasty?.teams])

  const persistEntries = async (entries) => {
    if (!currentDynasty) return
    const cur = currentDynasty.preseasonRankingsByYear || {}
    const nextPolls = { ...cur, [yearNum]: entries }

    const teamsCopy = { ...(currentDynasty.teams || {}) }
    const yearKey = String(yearNum)
    const writeRank = (tid, rank) => {
      if (tid == null) return
      const tidKey = String(tid)
      const team = teamsCopy[tidKey] || teamsCopy[tid] || {}
      const byYear = { ...(team.byYear || {}) }
      const yearEntry = { ...(byYear[yearKey] || byYear[yearNum] || {}) }
      const rankByWeek = { ...(yearEntry.rankByWeek || {}) }
      if (rank == null) { delete rankByWeek[0]; delete rankByWeek['0'] } else { rankByWeek[0] = rank }
      yearEntry.rankByWeek = rankByWeek
      byYear[yearKey] = yearEntry
      teamsCopy[tidKey] = { ...team, byYear }
    }
    const oldEntries = cur[yearNum] || cur[String(yearNum)] || []
    const newTids = new Set(entries.map(e => e.tid).filter(t => t != null))
    for (const oe of oldEntries) {
      if (oe?.tid != null && !newTids.has(Number(oe.tid))) writeRank(Number(oe.tid), null)
    }
    for (const e of entries) {
      if (e.tid != null) writeRank(Number(e.tid), e.rank)
    }

    await updateDynasty(currentDynasty.id, {
      preseasonRankingsByYear: nextPolls,
      teams: teamsCopy,
    })
  }

  const handleSheetSync = async (alsoDelete) => {
    if (!sheetId || !currentDynasty) return
    setSyncing(true)
    try {
      const result = await readPreseasonRankingsFromSheet(sheetId, currentDynasty, yearNum)

      const oldCount = (currentDynasty.preseasonRankingsByYear?.[yearNum] || []).length
      if (result.entries.length === 0 && oldCount >= 5) {
        toast.error(`Sheet appears empty. Refusing to clear ${oldCount} ranked teams — re-enter at least one and try again.`, { duration: 8000 })
        setSyncing(false)
        return
      }
      const removed = oldCount - result.entries.length
      if (oldCount > 0 && removed / Math.max(1, oldCount) > 0.3) {
        const ok = await confirm({
          title: 'Save preseason rankings?',
          message: `This will reduce the preseason poll from ${oldCount} to ${result.entries.length} ranked team${result.entries.length === 1 ? '' : 's'}. Continue?`,
          confirmLabel: 'Save',
          variant: 'danger',
        })
        if (!ok) { setSyncing(false); return }
      }
      if (result.unknownAbbrs?.length > 0) {
        toast.error(
          `Skipped ${result.unknownAbbrs.length} unknown abbreviation${result.unknownAbbrs.length === 1 ? '' : 's'}: ${result.unknownAbbrs.slice(0, 3).map(u => u.raw).join(', ')}${result.unknownAbbrs.length > 3 ? '…' : ''}`,
          { duration: 8000 },
        )
      }

      const entries = result.entries.map(e => ({ rank: e.rank, team: e.abbr, tid: e.tid }))
      if (entries.length === 0) {
        toast.error('No ranked teams found in the sheet.')
        setSyncing(false)
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
      if (!auth.handleError(error)) toast.error('Failed to read the sheet — try again.')
    } finally {
      setSyncing(false)
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
      onClose?.()
    } catch (error) {
      console.error('[PreseasonTop25Modal] sheet delete failed:', error)
      if (!auth.handleError(error)) toast.error('Failed to delete the sheet — try again.')
    } finally {
      setDeletingSheet(false)
    }
  }

  const handleRegenerate = async () => {
    if (!sheetId) return
    const confirmed = await confirm({
      title: 'Regenerate sheet?',
      message: 'This will delete your current sheet and create a fresh one. Any unsaved data will be lost.',
      confirmLabel: 'Regenerate',
      variant: 'danger',
    })
    if (!confirmed) return
    try {
      await deleteGoogleSheet(sheetId)
      const cur = currentDynasty?.preseasonRankingsSheetIdByYear || {}
      const next = { ...cur }
      delete next[yearNum]
      await updateDynasty(currentDynasty.id, { preseasonRankingsSheetIdByYear: next })
      setSheetId(null)
      auth.retry()
    } catch (error) {
      console.error('[PreseasonTop25Modal] regenerate failed:', error)
      if (!auth.handleError(error)) toast.error('Failed to regenerate sheet. Please try again.')
    }
  }

  if (!isOpen) return null

  const embedUrl = sheetId ? getSingleSheetEmbedUrl(sheetId) : null

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4 modal-backdrop-in"
      style={{ margin: 0 }}
      onMouseDown={onClose}
    >
      <div
        className={`card-elevated w-full max-h-[calc(100dvh-4rem)] flex flex-col overflow-hidden ${
          useEmbedded && !isMobile ? 'sm:w-[95vw] sm:h-[95dvh]' : 'sm:max-w-[680px] sm:h-auto'
        }`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <SheetModalHeader eyebrow="Preseason" title={`${yearNum} Top 25`} onClose={onClose} />

        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">
          {creatingSheet ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin w-12 h-12 border-4 rounded-full mx-auto mb-4" style={{ borderColor: 'var(--text-primary)', borderTopColor: 'transparent' }} />
                <p className="text-lg font-semibold text-txt-primary">Creating Rankings Sheet…</p>
                <SheetLoadingHint active={creatingSheet} />
              </div>
            </div>
          ) : sheetId ? (
            <div className="flex-1 flex flex-col overflow-hidden gap-3">
              <SheetModalAIHero
                tagline="Skip the typing. Let AI fill the preseason Top 25."
                buttons={[{ label: 'Copy AI Prompt', prompt: aiPrompt }]}
              />
              {isMobile || !useEmbedded ? (
                <SheetManualEntry sheetId={sheetId} />
              ) : (
                <div className="flex-1 flex flex-col overflow-hidden min-h-0 border border-surface-4 rounded-lg">
                  <SheetToolbar sheetId={sheetId} embedUrl={embedUrl} teamColors={teamColors} title="Preseason Rankings" />
                </div>
              )}
              <SheetModalFooter
                syncing={syncing}
                deletingSheet={deletingSheet}
                highlightSave={highlightSave}
                onSaveAndDelete={() => handleSheetSync(true)}
                onSaveAndKeep={() => handleSheetSync(false)}
                onDeleteSheetOnly={handleDeleteSheetOnly}
                onRegenerate={handleRegenerate}
                showEmbeddedToggle={!isMobile}
                useEmbedded={useEmbedded}
                onToggleEmbedded={() => {
                  const newValue = !useEmbedded
                  setUseEmbedded(newValue)
                  localStorage.setItem('sheetEmbedPreference', newValue.toString())
                }}
              />
            </div>
          ) : null}
        </div>
      </div>
      <AuthErrorModal isOpen={auth.showAuthError} onClose={auth.closeAuthError} onRefresh={auth.retry} teamColors={teamColors} />
    </div>,
    document.body,
  )
}
