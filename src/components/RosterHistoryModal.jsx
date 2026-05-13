import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import SheetModalHeader from './ui/SheetModalHeader'
import AuthErrorModal from './AuthErrorModal'
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler'
import SheetToolbar from './SheetToolbar'
import SheetModalAIHero from './ui/SheetModalAIHero'
import SheetManualEntry from './ui/SheetManualEntry'
import SheetModalFooter from './ui/SheetModalFooter'
import {
  createRosterHistorySheet,
  readRosterHistoryFromSheet,
  deleteGoogleSheet,
  getSingleSheetEmbedUrl,
  prefillRosterHistorySheet
} from '../services/sheetsService'
import { getTidFromAbbr } from '../data/teamRegistry'
import { getModalColors } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function RosterHistoryModal({ isOpen, onClose, teamColors }) {
  const { currentDynasty, updateDynasty, applyChangedPlayers } = useDynasty()
  const { user, signOut } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [creatingSheet, setCreatingSheet] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [sheetId, setSheetId] = useState(null)
  const [showDeletedNote, setShowDeletedNote] = useState(false)
  const auth = useAuthErrorHandler()
  const [isMobile, setIsMobile] = useState(false)

  const [useEmbedded, setUseEmbedded] = useState(() => {
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)

  // Ref to prevent concurrent sheet creation (state updates are async, refs are immediate)
  const creatingSheetRef = useRef(false)

  // Determine years to show based on dynasty data
  const startYear = currentDynasty?.startYear || 2025
  const currentYear = currentDynasty?.currentYear || startYear
  const years = []
  for (let y = startYear; y <= currentYear; y++) {
    years.push(y)
  }

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `Roster History`,
    structure: `This sheet has ONE tab: "Roster History". It has ${2 + years.length} columns total: Player Name (A), PID (B), then one team column per tracked year — ${years.map(y => `"${y} Team"`).join(', ')}. Row 1 is the protected header row. Up to 499 data rows (rows 2–500).

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Output ONLY the data rows (rows 2+). NEVER output the header row.
2. Every line must have EXACTLY ${2 + years.length} tab-separated columns (${1 + years.length} tab characters). Order: Player Name, PID, ${years.map(y => `${y} Team`).join(', ')}.
3. One player per line. Up to 499 players total.
4. NO COMMAS anywhere — not in names, not in PIDs.
5. PID is an INTEGER (no decimal point) OR blank. NEVER invent a PID. If you do not see a PID on the screenshot, leave that cell blank — the app will match by player name for new rows. Wrong PIDs will cause silent data corruption.
6. BLANK CELL for any year the player was NOT on a roster that season — leave empty (two tabs in a row). Do NOT use "-", "N/A", "None", or "FA".
7. Team columns: use ONLY the team abbreviations from the mapping below (e.g. BAMA, OSU, UGA). NEVER use full names ("Alabama"), nicknames ("Tide"), or mascots. Case-sensitive — all uppercase/mixed as shown in the mapping.
8. No header row, no totals, no commentary INSIDE the data, no blank separator rows. The paste-target label above the fence is required (see Method A/B rules above).

═══════════════════════════════════════════════════════════
TAB: "Roster History" — paste at cell A2 of the "Roster History" tab
═══════════════════════════════════════════════════════════

Column layout, tab-separated:

Col | Header (row 1, protected) | Your value                             | Format
----+---------------------------+----------------------------------------+---------------------------------------
 A  | Player Name               | Full name (First Last)                 | text — no commas, include suffix (Jr./II) if known
 B  | PID                       | Existing player ID (or blank)          | integer — ONLY if screenshot shows it; NEVER invent
${years.map((y, i) => ` ${String.fromCharCode(67 + i)}  | ${y} Team                   | Team player was on in ${y}                | DROPDOWN — team abbreviation from mapping, or BLANK`).join('\n')}

───────────────────────────────────────────────────────────
TEAM COLUMNS — Dropdown values:
Use ONLY abbreviations from the team-abbreviation mapping provided at the bottom of this prompt (format: ABBR = Full Name). Examples: BAMA = Alabama, OSU = Ohio State, UGA = Georgia. Case must match the mapping exactly.

A blank cell means "not on any roster that year" (e.g. pre-enrollment year, transferred out with unknown destination, graduated, not yet recruited). Blank is the correct answer for any unknown season — never guess.

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== ROSTER HISTORY — paste at cell A2 of "Roster History" tab ===
<Player Name>\t<PID or blank>\t${years.map(y => `<${y} team abbr or blank>`).join('\t')}
<Player Name>\t<PID or blank>\t${years.map(y => `<${y} team abbr or blank>`).join('\t')}
…one line per player

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Every line has exactly ${2 + years.length} tab-separated columns (${1 + years.length} tab characters)
[ ] No header row, no commentary INSIDE the data (the paste-target label above the fence is required, see Method A/B rules above)
[ ] PID column is either an integer from the screenshot, or BLANK — never invented
[ ] No commas in any cell
[ ] All team values are exact abbreviations from the mapping below
[ ] Blank cell for every year a player was NOT on a roster — no "-", "N/A", "FA"
[ ] Player Name has no trailing whitespace
[ ] At most 499 data lines`,
    includeTeamMap: true,
    dynastyTeams: currentDynasty?.teams,
  }), [years.join(','), currentDynasty?.teams])

  useEffect(() => {
    setIsMobile(isMobileDevice())
    const handleResize = () => setIsMobile(isMobileDevice())
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Highlight save button when user returns to the window
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

  // Create sheet when modal opens
  useEffect(() => {
    const createSheet = async () => {
      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote) {
        // Set ref immediately to prevent concurrent calls (state updates are async)
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          // Delete any existing roster history sheet first
          const existingSheetId = currentDynasty?.rosterHistorySheetId
          if (existingSheetId) {
            try {
              await deleteGoogleSheet(existingSheetId)
            } catch {
              // Ignore errors if sheet doesn't exist or already deleted
            }
          }

          // Create fresh sheet
          const sheetInfo = await createRosterHistorySheet(
            currentDynasty?.dynastyName || 'Dynasty',
            years,
            currentDynasty?.teams || currentDynasty?.customTeams
          )

          // Prefill with all non-honor-only players
          const players = (currentDynasty?.players || []).filter(p => !p.isHonorOnly)
          if (players.length > 0) {
            await prefillRosterHistorySheet(sheetInfo.spreadsheetId, players, years)
          }

          setSheetId(sheetInfo.spreadsheetId)

          // Save sheet ID to dynasty
          await updateDynasty(currentDynasty.id, {
            rosterHistorySheetId: sheetInfo.spreadsheetId
          })
        } catch (error) {
          console.error('Failed to create roster history sheet:', error)
          auth.handleError(error)
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }

    createSheet()
  }, [isOpen, user, sheetId, creatingSheet, currentDynasty?.id, auth.retryCount, showDeletedNote])

  // Reset state when modal closes
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
      const historyData = await readRosterHistoryFromSheet(sheetId, years, (currentDynasty?.teams || currentDynasty?.customTeams))
      const useFullTidSystem = currentDynasty?._tidFullyMigrated === true

      // Helper to convert teamsByYear values to tid format for migrated dynasties
      const convertTeamsByYear = (teamsByYear) => {
        if (!useFullTidSystem) return teamsByYear
        return Object.fromEntries(
          Object.entries(teamsByYear).map(([yearKey, teamValue]) => {
            if (typeof teamValue === 'number') return [yearKey, teamValue]
            const tid = getTidFromAbbr(teamValue, currentDynasty)
            return [yearKey, tid || teamValue]
          })
        )
      }

      // Update players with teamsByYear data
      const updatedPlayers = (currentDynasty?.players || []).map(player => {
        if (player.isHonorOnly) return player

        // Find matching entry by PID
        const match = historyData.find(h => h.pid === player.pid)
        if (match && Object.keys(match.teamsByYear).length > 0) {
          return {
            ...player,
            teamsByYear: {
              ...(player.teamsByYear || {}),
              ...convertTeamsByYear(match.teamsByYear)
            }
          }
        }
        return player
      })

      await applyChangedPlayers(currentDynasty.id, updatedPlayers)
      onClose()
    } catch (error) {
      console.error(error)
      if (!auth.handleError(error)) {
        toast.error('Failed to sync from Google Sheets. Make sure data is properly formatted.')
      }
    } finally {
      setSyncing(false)
    }
  }

  const handleSyncAndDelete = async () => {
    if (!sheetId) return

    setDeletingSheet(true)
    try {
      const historyData = await readRosterHistoryFromSheet(sheetId, years, (currentDynasty?.teams || currentDynasty?.customTeams))
      const useFullTidSystem = currentDynasty?._tidFullyMigrated === true

      // Helper to convert teamsByYear values to tid format for migrated dynasties
      const convertTeamsByYear = (teamsByYear) => {
        if (!useFullTidSystem) return teamsByYear
        return Object.fromEntries(
          Object.entries(teamsByYear).map(([yearKey, teamValue]) => {
            if (typeof teamValue === 'number') return [yearKey, teamValue]
            const tid = getTidFromAbbr(teamValue, currentDynasty)
            return [yearKey, tid || teamValue]
          })
        )
      }

      // Update players with teamsByYear data
      const updatedPlayers = (currentDynasty?.players || []).map(player => {
        if (player.isHonorOnly) return player

        // Find matching entry by PID
        const match = historyData.find(h => h.pid === player.pid)
        if (match && Object.keys(match.teamsByYear).length > 0) {
          return {
            ...player,
            teamsByYear: {
              ...(player.teamsByYear || {}),
              ...convertTeamsByYear(match.teamsByYear)
            }
          }
        }
        return player
      })

      await applyChangedPlayers(currentDynasty.id, updatedPlayers)

      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { rosterHistorySheetId: null })

      setSheetId(null)
      setShowDeletedNote(true)
      setTimeout(() => {
        onClose()
      }, 2500)
    } catch (error) {
      console.error('Error in handleSyncAndDelete:', error)
      if (!auth.handleError(error)) {
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
      await updateDynasty(currentDynasty.id, { rosterHistorySheetId: null })
      setSheetId(null)
      auth.retry()
    } catch (error) {
      console.error('Failed to regenerate sheet:', error)
      if (!auth.handleError(error)) {
        toast.error('Failed to regenerate sheet. Please try again.')
      }
    } finally {
      setRegenerating(false)
    }
  }

  const handleDeleteSheetOnly = async () => {
    if (!sheetId || !currentDynasty) return
    const ok = await confirm({
      title: 'Delete this roster history sheet?',
      message: 'This deletes the Google Sheet without applying any edits. Your dynasty roster history stays as-is.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    setDeletingSheet(true)
    try {
      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { rosterHistorySheetId: null })
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

  const handleClose = () => {
    onClose()
  }

  if (!isOpen) return null

  const embedUrl = sheetId ? getSingleSheetEmbedUrl(sheetId) : null
  const isLoading = creatingSheet

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={handleClose}
    >
      <div
        className={`card-elevated w-full max-h-[calc(100dvh-4rem)] flex flex-col overflow-hidden ${
          useEmbedded
            ? 'sm:w-[95vw] sm:h-[95dvh]'
            : 'sm:max-w-[680px] sm:h-auto'
        }`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <SheetModalHeader eyebrow="Roster" title="Roster History Editor" onClose={handleClose} />
        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div
                className="animate-spin w-12 h-12 border-4 rounded-full mx-auto mb-4"
                style={{
                  borderColor: 'var(--text-primary)',
                  borderTopColor: 'transparent'
                }}
              />
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xl font-bold text-txt-primary">Saved</p>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden gap-3">
            <SheetModalAIHero
              tagline="Skip the typing. Let AI fill the roster history."
              buttons={[{ label: 'Copy AI Prompt', prompt: aiPrompt }]}
            />
            {isMobile || !useEmbedded ? (
              <SheetManualEntry sheetId={sheetId} />
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0 border border-surface-4 rounded-lg">
                <SheetToolbar sheetId={sheetId} embedUrl={embedUrl} teamColors={teamColors} title="Roster History" />
              </div>
            )}
            <SheetModalFooter
              syncing={syncing}
              deletingSheet={deletingSheet}
              regenerating={regenerating}
              highlightSave={highlightSave}
              onSaveAndDelete={handleSyncAndDelete}
              onSaveAndKeep={handleSyncFromSheet}
              onDeleteSheetOnly={handleDeleteSheetOnly}
              onRegenerate={handleRegenerateSheet}
              showEmbeddedToggle={!isMobile}
              useEmbedded={useEmbedded}
              onToggleEmbedded={() => { const newValue = !useEmbedded; setUseEmbedded(newValue); localStorage.setItem('sheetEmbedPreference', newValue.toString()); }}
            />
          </div>
        ) : null}
        </div>
      </div>

      {/* Auth Error Modal */}
      <AuthErrorModal
        isOpen={auth.showAuthError}
        onClose={auth.closeAuthError}
        onRefresh={auth.retry}
        teamColors={teamColors}
      />
    </div>,
    document.body,
  )
}
