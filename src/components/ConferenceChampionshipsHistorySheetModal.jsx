import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty, getCustomConferencesForYear } from '../context/DynastyContext'
import { conferenceTeams as DEFAULT_CONFERENCE_TEAMS } from '../data/conferenceTeams'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import SheetModalHeader from './ui/SheetModalHeader'
import SheetModalAIHero from './ui/SheetModalAIHero'
import SheetModalFooter from './ui/SheetModalFooter'
import SheetManualEntry from './ui/SheetManualEntry'
import SheetToolbar from './SheetToolbar'
import AuthErrorModal from './AuthErrorModal'
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler'
import SheetLoadingHint from './SheetLoadingHint'
import {
  createConferenceChampionshipsHistorySheet,
  readConferenceChampionshipsHistoryFromSheet,
  deleteGoogleSheet,
  getSingleSheetEmbedUrl,
} from '../services/sheetsService'
import { buildAIPrompt } from '../utils/aiPrompt'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

const HISTORY_CONFERENCES = [
  'ACC',
  'American',
  'Big 12',
  'Big Ten',
  'Conference USA',
  'MAC',
  'Mountain West',
  'Pac-12',
  'SEC',
  'Sun Belt',
]

/**
 * ConferenceChampionshipsHistorySheetModal — multi-year edit surface for
 * conference championship games. One Google Sheet, one tab per year
 * (current year first, then strictly descending past years). Each tab
 * uses the same 5-column layout as the single-year CC sheet
 * (Conference, Team 1, Team 2, Team 1 Score, Team 2 Score) pre-filled
 * with that year's existing CC games.
 *
 * Mirrors the ConferenceChampionshipModal shell — SheetModalHeader +
 * SheetModalAIHero + SheetManualEntry/SheetToolbar + SheetModalFooter —
 * so the AI workflow + embedded-view toggle + footer actions all match
 * what users already know from the single-year flow. The sheet ID is
 * persisted on `dynasty.confChampHistorySheetId` so re-opening resumes
 * the existing sheet instead of creating a fresh one.
 */
export default function ConferenceChampionshipsHistorySheetModal({ isOpen, onClose }) {
  const { currentDynasty, updateDynasty, saveConferenceChampionshipsHistoryFromSheet, isViewOnly } = useDynasty()
  const { user } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()

  const [creatingSheet, setCreatingSheet] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [sheetId, setSheetId] = useState(null)
  const [yearsOnSheet, setYearsOnSheet] = useState([])
  const [showDeletedNote, setShowDeletedNote] = useState(false)
  const [highlightSave, setHighlightSave] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [useEmbedded, setUseEmbedded] = useState(() => {
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const auth = useAuthErrorHandler()
  const creatingSheetRef = useRef(false)

  useEffect(() => {
    setIsMobile(isMobileDevice())
    const handleResize = () => setIsMobile(isMobileDevice())
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Highlight the Save button when the user comes back to the tab —
  // signals "you've been editing in Google Sheets, click here to commit."
  useEffect(() => {
    if (!isOpen || !sheetId || useEmbedded) return
    const handleFocus = () => {
      setHighlightSave(true)
      setTimeout(() => setHighlightSave(false), 5000)
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') handleFocus()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [isOpen, sheetId, useEmbedded])

  // Resume an existing sheet if one is already stored on the dynasty.
  useEffect(() => {
    if (!isOpen) return
    if (currentDynasty?.confChampHistorySheetId && !sheetId && !showDeletedNote) {
      setSheetId(currentDynasty.confChampHistorySheetId)
    }
  }, [isOpen, currentDynasty?.confChampHistorySheetId, sheetId, showDeletedNote])

  // Determine which years would render on a fresh sheet — used by the AI
  // prompt and shown to the user as eyebrow context. Same logic the
  // createConferenceChampionshipsHistorySheet service uses, kept in sync
  // by shape: every year with a stored CC game ∪ currentYear, current
  // year first, then descending.
  const orderedYearsForPrompt = useMemo(() => {
    if (!currentDynasty) return []
    const set = new Set()
    for (const g of (currentDynasty.games || [])) {
      if (g?.isConferenceChampionship || g?.gameType === 'conference_championship') {
        const y = Number(g.year)
        if (Number.isFinite(y)) set.add(y)
      }
    }
    if (currentDynasty.currentYear != null) {
      const cy = Number(currentDynasty.currentYear)
      if (Number.isFinite(cy)) set.add(cy)
    }
    const cy = Number(currentDynasty.currentYear)
    return [...set].filter(Number.isFinite).sort((a, b) => {
      if (Number.isFinite(cy)) {
        if (a === cy && b !== cy) return -1
        if (b === cy && a !== cy) return 1
      }
      return b - a
    })
  }, [currentDynasty?.games, currentDynasty?.currentYear])

  // The list the AI prompt actually walks — prefer years that are
  // already on the sheet (covers the case where the user originally
  // generated the sheet at currentYear=N and has since advanced to
  // N+1; the sheet still has N tabs, and the prompt should describe
  // those, not the post-advance year list).
  const promptYears = yearsOnSheet.length > 0 ? yearsOnSheet : orderedYearsForPrompt

  // Build a multi-block AI prompt — one labeled TSV block per year tab.
  // Conference membership is included per-year so realigned dynasties
  // (e.g. Missouri + Georgia in the Pac-12 in 2032) don't get stale
  // real-world conferences from the model.
  const aiPrompt = useMemo(() => {
    if (!currentDynasty || promptYears.length === 0) return ''

    const totalRows = HISTORY_CONFERENCES.length
    const orderListInline = HISTORY_CONFERENCES.join(', ')

    // Build abbr → school-name map once for the membership block.
    const abbrToName = {}
    for (const t of Object.values(currentDynasty.teams || {})) {
      if (t?.abbr && t?.name) abbrToName[String(t.abbr).toUpperCase()] = t.name
    }

    const buildMembershipBlock = (year) => {
      const customConfs = getCustomConferencesForYear(currentDynasty, year)
      const sourceMap = customConfs || DEFAULT_CONFERENCE_TEAMS
      return HISTORY_CONFERENCES.map(conf => {
        const abbrs = Array.isArray(sourceMap[conf]) ? [...sourceMap[conf]] : []
        abbrs.sort((a, b) => String(a).localeCompare(String(b)))
        if (abbrs.length === 0) return `${conf}: (no teams assigned in this dynasty)`
        const entries = abbrs.map(a => {
          const upper = String(a).toUpperCase()
          const name = abbrToName[upper]
          return name ? `${upper} (${name})` : upper
        })
        return `${conf}: ${entries.join(', ')}`
      }).join('\n')
    }

    const rowOrderTable = HISTORY_CONFERENCES
      .map((conf, i) => {
        const sheetRow = String(i + 2).padStart(5, ' ')
        const confPadded = conf.padEnd(20, ' ')
        return `  ${sheetRow}    | ${confPadded} | <Team1 abbr>\\t<Team2 abbr>\\t<int>\\t<int>`
      })
      .join('\n')

    const perTabOutput = HISTORY_CONFERENCES
      .map(conf => `<${conf} row: Team1\\tTeam2\\tScore1\\tScore2   OR blank line if unknown>`)
      .join('\n')

    const yearBlocks = promptYears.map(year => `
═══════════════════════════════════════════════════════════
TAB "${year} Conference Championships" — ${totalRows} rows × 4 output columns
Paste at cell B2 of the "${year} Conference Championships" tab
═══════════════════════════════════════════════════════════

Column A is pre-filled with these ${totalRows} conferences in this EXACT order. Match line-for-line:

Sheet Row | Col A (PROTECTED)    | Your output: Team1\\tTeam2\\tTeam1Score\\tTeam2Score
----------+----------------------+----------------------------------------------------
${rowOrderTable}

CONFERENCE MEMBERSHIP FOR ${year} — dynasty-specific, NOT real life:
${buildMembershipBlock(year)}

Per-line output (4 tab-separated fields):
<Team 1 Abbr>\\t<Team 2 Abbr>\\t<Team 1 Score>\\t<Team 2 Score>

=== ${year} CONFERENCE CHAMPIONSHIPS — paste at cell B2 of "${year} Conference Championships" tab ===
${perTabOutput}
`).join('\n')

    const yearsInline = promptYears.join(', ')
    const exclusionNote = `Output exactly ${totalRows} lines (one per conference, in the exact order listed above) FOR EACH YEAR TAB.`

    return buildAIPrompt({
      title: `Conference Championships History (${promptYears[0]}–${promptYears[promptYears.length - 1]})`,
      multiBlock: true,
      structure: `This sheet has ${promptYears.length} tab${promptYears.length === 1 ? '' : 's'} — one per year. Tab order (this is the order on the sheet, do not re-sort): ${yearsInline}.

Each year tab uses the SAME 5-column layout:
- Column A (Conference name) is PRE-FILLED and PROTECTED — never output it.
- You fill columns B (Team 1), C (Team 2), D (Team 1 Score), E (Team 2 Score).

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Output ONLY columns B, C, D, E. Never output column A (conference name) or the header row.
2. Row order is FIXED per tab — it is NOT alphabetical. The sheet pre-fills column A in the EXACT order listed in each year's row table below. Your line N must correspond to the conference on sheet row N+1. Do not re-sort.
3. ${exclusionNote}
4. NO COMMAS in scores. Integers only. No decimals.
5. BLANK LINE (empty, no tabs) if you do not know the CC result for a conference for that year. Never guess. Never invent scores. The blank still counts as that conference's line — keep position so all later lines stay aligned.
6. Team 1 and Team 2 must BOTH be members of the conference for that row, ACCORDING TO THE PER-YEAR CONFERENCE MEMBERSHIP BLOCK BELOW — not according to real-world conferences. Users realign teams (e.g. Missouri and Georgia could be in the Pac-12 in this dynasty). Look every team up in the membership block for that year before you write it.
7. Both teams must use UPPERCASE abbreviations from the mapping at the bottom — NEVER full names or nicknames.
8. ONE block per year tab. Each block is preceded by its own paste-target label (Method A/B rules above).

Order of conferences (same for every year): ${orderListInline}.
${yearBlocks}
═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] One block per year tab — tabs in this exact order: ${yearsInline}
[ ] Each block has exactly ${totalRows} lines, in conference order: ${orderListInline}
[ ] Each block's first line is for ${HISTORY_CONFERENCES[0]} (NOT alphabetical — match the row table)
[ ] Each block's last line is for ${HISTORY_CONFERENCES[totalRows - 1]}
[ ] Every non-blank line has exactly 4 tab-separated fields (3 tabs)
[ ] Both teams on each line appear in that year's conference list in its CONFERENCE MEMBERSHIP block (not your real-world knowledge)
[ ] Team 1 and Team 2 are different teams
[ ] All team values are uppercase abbreviations from the mapping — no full names
[ ] All scores are integers with no commas and no decimals
[ ] Blank entire lines for unknown results — nothing invented (still keeps the line position)
[ ] No Conference name, no header row, no commentary INSIDE the data. Paste-target labels live OUTSIDE each fence.`,
      includeTeamMap: true,
      dynastyTeams: currentDynasty?.teams,
    })
  }, [
    currentDynasty?.teams,
    currentDynasty?.customConferences,
    currentDynasty?.customConferencesByYear,
    currentDynasty?.conferenceByTeamYear,
    promptYears,
  ])

  // Create the sheet on first open (or after a delete) when none is
  // currently stored.
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
        setYearsOnSheet(info.years || [])
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
        toast.error('No year tabs found on the sheet. Try resetting the sheet.')
        return
      }

      // Keep our local view of "what years live on this sheet" fresh so
      // the AI prompt re-renders against the right set even if the user
      // generated the sheet in a prior season.
      setYearsOnSheet(result.years)

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
        setYearsOnSheet([])
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
      setYearsOnSheet([])
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

  const handleRegenerateSheet = async () => {
    if (!sheetId || !currentDynasty) return
    const ok = await confirm({
      title: 'Reset this sheet?',
      message: 'Deletes the current sheet and creates a fresh one re-pre-filled from your dynasty\'s current CC games. Any unsaved edits on the sheet will be lost.',
      confirmLabel: 'Reset',
      variant: 'danger',
    })
    if (!ok) return
    setRegenerating(true)
    try {
      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { confChampHistorySheetId: null })
      setSheetId(null)
      setYearsOnSheet([])
      // Bumping auth.retryCount triggers the create useEffect to fire again.
      auth.retry()
    } catch (error) {
      console.error('Failed to regenerate CC history sheet:', error)
      if (!auth.handleError(error)) {
        toast.error('Failed to reset the sheet — try again.')
      }
    } finally {
      setRegenerating(false)
    }
  }

  if (!isOpen) return null

  // The multi-tab embed URL defaults to gid=0, which is the first tab —
  // and the first tab is the current year (createConferenceChampionships-
  // HistorySheet sorts current year first), so the iframe opens on the
  // active season for free.
  const embedUrl = sheetId ? getSingleSheetEmbedUrl(sheetId) : null
  const isLoading = creatingSheet || regenerating
  const yearsLabel = promptYears.length > 0
    ? `${promptYears.length} year${promptYears.length === 1 ? '' : 's'} · ${promptYears[promptYears.length - 1]}–${promptYears[0]}`
    : ''

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4 modal-backdrop-in"
      style={{ margin: 0 }}
      onMouseDown={onClose}
    >
      <div
        className={`card-elevated w-full max-h-[calc(100dvh-4rem)] flex flex-col overflow-hidden ${
          useEmbedded
            ? 'sm:w-[95vw] sm:h-[95dvh]'
            : 'sm:max-w-[680px] sm:h-auto'
        }`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <SheetModalHeader
          eyebrow="History"
          title={yearsLabel ? `Conference Championships · ${yearsLabel}` : 'Conference Championships'}
          onClose={onClose}
        />

        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div
                  className="animate-spin w-12 h-12 border-4 rounded-full mx-auto mb-4"
                  style={{ borderColor: 'var(--text-primary)', borderTopColor: 'transparent' }}
                />
                <p className="text-lg font-semibold text-txt-primary">
                  {regenerating ? 'Resetting sheet…' : 'Creating Conference Championships Sheet…'}
                </p>
                <p className="text-sm mt-2 text-txt-secondary">
                  One tab per year — current year first.
                </p>
                <SheetLoadingHint active={isLoading} />
              </div>
            </div>
          ) : showDeletedNote ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="card p-8 border-l-[3px] text-center max-w-sm" style={{ borderLeftColor: 'var(--surface-5)' }}>
                <p className="label-xs text-txt-tertiary mb-2">Status</p>
                <p className="text-xl font-bold text-txt-primary mb-2">Saved &amp; Moved to Trash</p>
                <p className="text-sm text-txt-secondary">Conference Championship data saved to your dynasty.</p>
              </div>
            </div>
          ) : sheetId ? (
            <div className="flex-1 flex flex-col overflow-hidden gap-3">
              <SheetModalAIHero
                tagline="Skip the typing. Let AI fill every year's conference championships."
                description="Copy the prompt → paste it into your AI assistant (with screenshots if you have them) → the AI returns one TSV block per year tab. Paste each block at the cell it tells you, then save."
                buttons={[{ label: 'Copy AI Prompt', prompt: aiPrompt }]}
              />
              {isMobile || !useEmbedded ? (
                <SheetManualEntry sheetId={sheetId} />
              ) : (
                <div className="flex-1 flex flex-col overflow-hidden min-h-0 border border-surface-4 rounded-lg">
                  <SheetToolbar
                    sheetId={sheetId}
                    embedUrl={embedUrl}
                    title="Conference Championships"
                  />
                </div>
              )}
              <SheetModalFooter
                syncing={syncing}
                deletingSheet={deletingSheet}
                regenerating={regenerating}
                highlightSave={highlightSave}
                onSaveAndDelete={() => handleSyncFromSheet(true)}
                onSaveAndKeep={() => handleSyncFromSheet(false)}
                onDeleteSheetOnly={handleDeleteSheetOnly}
                onRegenerate={handleRegenerateSheet}
                showEmbeddedToggle={!isMobile}
                useEmbedded={useEmbedded}
                onToggleEmbedded={() => {
                  const next = !useEmbedded
                  setUseEmbedded(next)
                  localStorage.setItem('sheetEmbedPreference', next.toString())
                }}
              />
            </div>
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
