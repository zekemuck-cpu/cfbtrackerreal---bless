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
import LocalDataEntry from './ui/LocalDataEntry'
import { splitTsv } from '../utils/tsvParse'
import { getTeamNameOptions, getTeamNameLabel, getTeamNameAliases } from '../data/teamRegistry'

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
  const teamAbbrs = useMemo(() => getTeamNameOptions(currentDynasty?.teams, { includeFCS: false }), [currentDynasty?.teams])

  const [sheetId, setSheetId] = useState(null)
  const [creatingSheet, setCreatingSheet] = useState(false)
  // Local paste is the DEFAULT; the Google Sheet flow is the opt-in fallback.
  const [useLocal, setUseLocal] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [useEmbedded, setUseEmbedded] = useState(() =>
    localStorage.getItem('sheetEmbedPreference') === 'true'
  )
  const [highlightSave, setHighlightSave] = useState(false)
  const creatingSheetRef = useRef(false)
  const creationAttemptedRef = useRef(false)
  const lastRetryCountRef = useRef(auth.retryCount)

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
      creationAttemptedRef.current = false
      setUseLocal(true)
      return
    }
    const stored = currentDynasty?.preseasonRankingsSheetIdByYear?.[yearNum]
    if (stored) { setSheetId(stored); return }
  }, [isOpen])

  useEffect(() => {
    if (auth.retryCount !== lastRetryCountRef.current) {
      lastRetryCountRef.current = auth.retryCount
      creationAttemptedRef.current = false
    }
    // Don't create a Google Sheet while the local paste path is active.
    if (!isOpen || useLocal || !user || sheetId || creatingSheet || creatingSheetRef.current || isViewOnly || creationAttemptedRef.current) return
    const create = async () => {
      creationAttemptedRef.current = true
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
          toast.error('Failed to create the rankings sheet. Try again.')
        }
      } finally {
        setCreatingSheet(false)
        creatingSheetRef.current = false
      }
    }
    create()
  }, [isOpen, useLocal, user, sheetId, currentDynasty?.id, isViewOnly, auth.retryCount])

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
1. Output ONLY column B (one team name per line). NEVER output column A (rank), the header row, or any rank labels.
2. Row order is FIXED: rank 1 first, rank 25 last. EXACTLY 25 lines of output.
3. Each line has EXACTLY 1 field: <Team name>
4. Team values must be team names from the list at the bottom — NEVER an abbreviation, nickname, or mascot.
5. NO COMMAS. No commentary INSIDE the data. No rank numbers. No header row. No tabs.
6. Each team name must appear AT MOST ONCE across all 25 ranks — no duplicates in the poll.
7. BLANK line for unknown ranks (just an empty line). Never guess.
8. Output ONLY the fenced tsv block, nothing before or after it.

═══════════════════════════════════════════════════════════
SECTION "${yearNum} Preseason Top 25" — 25 rows × 1 output column
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

  // Pre-fill the local grid with this year's saved preseason Top 25. This is a
  // SINGLE-COLUMN, POSITION-BASED format: handleLocalImport reads rows[r][1] for
  // r = 1..25 with the rank derived from line position (splitTsv drops blank
  // lines). So the pre-fill can only round-trip when the saved poll is a
  // CONTIGUOUS 1..N (no internal gaps). Abbr is derived from tid (mirroring
  // createPreseasonRankingsSheet's seed: dynasty.teams[tid].abbr preferred,
  // else e.team). When ranks are dense from 1, emit one team name per line in rank
  // order; when ragged, leave the grid blank rather than mis-rank the pre-fill.
  const initialText = useMemo(() => {
    const poll = currentDynasty?.preseasonRankingsByYear?.[yearNum]
      || currentDynasty?.preseasonRankingsByYear?.[String(yearNum)]
      || []
    if (!Array.isArray(poll) || poll.length === 0) return ''
    const teams = currentDynasty?.teams || {}
    const sorted = poll
      .filter(e => e && typeof e.rank === 'number' && e.rank >= 1)
      .map(e => {
        const abbr = e.tid != null
          ? (getTeamNameLabel(teams, e.tid) || e.team)
          : e.team
        return { rank: e.rank, abbr }
      })
      .filter(e => e.abbr)
      .sort((a, b) => a.rank - b.rank)
    if (sorted.length === 0) return ''
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].rank !== i + 1) return ''
    }
    return sorted.map(e => String(e.abbr).toUpperCase()).join('\n')
  }, [currentDynasty?.preseasonRankingsByYear, currentDynasty?.teams, yearNum])

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

  // Local paste import: the AI emits ONE column-B abbreviation per line (column
  // A rank is pre-filled on the sheet, so it's never output). The parser reads
  // rows[r][1] for r = 1..25 (rank = row position), so prepend a header row at
  // index 0 and place each abbr at column index 1 — the [rank, abbr] shape the
  // Sheets API A1:B26 read returns. Reuses handleSheetSync's guardrails.
  const handleLocalImport = async (text) => {
    if (!currentDynasty) return
    // Accept a bare "Team" per line OR a rank-led "1<TAB>Team": take the team
    // from cell 1 when cell 0 is a rank number, else cell 0. The reader reads
    // the team from column index 1 (the A1:B26 [rank, abbr] shape).
    const rows = [[], ...splitTsv(text).map((cells) => {
      const rankLed = cells.length >= 2 && /^\d{1,2}$/.test(String(cells[0]).trim())
      return ['', (rankLed ? cells[1] : cells[0]) ?? '']
    })]
    const result = await readPreseasonRankingsFromSheet(null, currentDynasty, yearNum, { rows })

    const oldCount = (currentDynasty.preseasonRankingsByYear?.[yearNum] || []).length
    if (result.entries.length === 0 && oldCount >= 5) {
      toast.error(`Paste appears empty. Refusing to clear ${oldCount} ranked teams — re-enter at least one and try again.`, { duration: 8000 })
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
      if (!ok) return
    }
    if (result.unknownAbbrs?.length > 0) {
      toast.error(
        `Skipped ${result.unknownAbbrs.length} unknown abbreviation${result.unknownAbbrs.length === 1 ? '' : 's'}: ${result.unknownAbbrs.slice(0, 3).map(u => u.raw).join(', ')}${result.unknownAbbrs.length > 3 ? '…' : ''}`,
        { duration: 8000 },
      )
    }
    const entries = result.entries.map(e => ({ rank: e.rank, team: e.abbr, tid: e.tid }))
    if (entries.length === 0) {
      toast.error('No ranked teams found in the paste.')
      return
    }
    await persistEntries(entries)
    toast.success(`Saved Preseason Top ${entries.length}.`)
    onClose?.()
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
      if (!auth.handleError(error)) toast.error('Failed to read the sheet. Try again.')
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
      if (!auth.handleError(error)) toast.error('Failed to delete the sheet. Try again.')
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
          {useLocal ? (
            <LocalDataEntry
              aiPrompt={aiPrompt}
              onImport={handleLocalImport}
              onUseGoogle={() => setUseLocal(false)}
              onCancel={onClose}
              importLabel="Import Top 25"
              columns={['Team']}
              comboboxColumns={{ 'Team': teamAbbrs }}
              comboboxAliases={getTeamNameAliases(currentDynasty?.teams)}
              initialText={initialText}
            />
          ) : creatingSheet ? (
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
