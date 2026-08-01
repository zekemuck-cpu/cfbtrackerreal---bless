import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty, isPlayerOnRoster } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import SheetModalHeader from './ui/SheetModalHeader'
import SheetModalAIHero from './ui/SheetModalAIHero'
import SheetManualEntry from './ui/SheetManualEntry'
import SheetModalFooter from './ui/SheetModalFooter'
import AuthErrorModal from './AuthErrorModal'
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler'
import {
  createTransferDestinationsSheet,
  readTransferDestinationsFromSheet,
  deleteGoogleSheet,
  getSheetEmbedUrl,
  sheetExists
} from '../services/sheetsService'
import { getModalColors } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'
import LocalDataEntry from './ui/LocalDataEntry'
import { splitTsv } from '../utils/tsvParse'
import { getTeamNameOptions, getTeamNameLabel, getTeamNameAliases } from '../data/teamRegistry'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function TransferDestinationsModal({ isOpen, onClose, onSave, currentYear, teamColors }) {
  const { currentDynasty, updateDynasty } = useDynasty()
  const { user } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])
  const teamAbbrs = useMemo(() => getTeamNameOptions(currentDynasty?.teams, { includeFCS: false }), [currentDynasty?.teams])
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [creatingSheet, setCreatingSheet] = useState(false)
  const [sheetId, setSheetId] = useState(() => {
    // Reuse existing sheet if it was created for the same season
    if (
      currentDynasty?.transferDestinationsSheetId &&
      currentDynasty?.transferDestinationsSheetYear === currentYear
    ) {
      return currentDynasty.transferDestinationsSheetId
    }
    return null
  })
  const [showDeletedNote, setShowDeletedNote] = useState(false)
  const auth = useAuthErrorHandler()
  const [isMobile, setIsMobile] = useState(false)
  // Local paste is the DEFAULT; the Google Sheet flow is the opt-in fallback.
  const [useLocal, setUseLocal] = useState(true)

  const [useEmbedded, setUseEmbedded] = useState(() => {
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [noTransfers, setNoTransfers] = useState(false)

  // Roster block for AI name resolution. Transfer Destinations concerns
  // players who just left the team this offseason — they won't be on the
  // current roster anymore, so check BOTH the current year AND the year
  // before (that's when they last played for us). Superset catches them.
  const userRoster = useMemo(() => {
    const teamTidForRoster =
      currentDynasty?.currentTid ??
      (currentDynasty?.teams?.[currentDynasty?.currentTid]?.abbr || currentDynasty?.teamName)
    const all = currentDynasty?.players || []
    const prevYear = Number(currentYear) - 1
    return all
      .filter(p => !p.isHonorOnly)
      .filter(p =>
        isPlayerOnRoster(p, teamTidForRoster, currentYear) ||
        isPlayerOnRoster(p, teamTidForRoster, prevYear)
      )
      .map(p => ({ name: p.name, jerseyNumber: p.jerseyNumber, position: p.position }))
  }, [currentDynasty?.players, currentDynasty?.teams, currentDynasty?.currentTid, currentDynasty?.teamName, currentYear])

  // Pre-fill the local grid with THIS team's already-saved transfer
  // destinations for the year so the modal opens ready to edit. The parser
  // reads row[0]=Player, row[1]=New Team and requires BOTH non-blank, so we
  // emit only entries with a name and a destination — round-trip safe.
  // Mirror handleTransferDestinationsSave's year: it flips to the prior season
  // once we're at/after Signing Day (offseason week >= 5).
  const initialText = useMemo(() => {
    const isAfterYearFlip = currentDynasty?.currentPhase === 'offseason' && currentDynasty?.currentWeek >= 5
    const dataYear = isAfterYearFlip ? Number(currentYear) - 1 : Number(currentYear)
    const tid = currentDynasty?.currentTid
    const teamAbbr = getTeamNameLabel(currentDynasty?.teams, tid) || currentDynasty?.teamName
    const fromTid = tid != null
      ? currentDynasty?.teams?.[tid]?.byYear?.[dataYear]?.transferDestinations
      : null
    const legacy = currentDynasty?.transferDestinationsByTeamYear
    const fromLegacy =
      (tid != null ? legacy?.[tid]?.[dataYear] : null) ??
      (teamAbbr ? legacy?.[teamAbbr]?.[dataYear] : null)
    const dests = fromTid ?? fromLegacy ?? []
    return dests
      .filter(d => d?.playerName && d?.newTeam)
      .map(d => `${d.playerName}\t${d.newTeam}`)
      .join('\n')
  }, [currentDynasty?.teams, currentDynasty?.currentTid, currentDynasty?.teamName, currentDynasty?.transferDestinationsByTeamYear, currentDynasty?.currentPhase, currentDynasty?.currentWeek, currentYear])

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} Transfer Destinations`,
    roster: userRoster,
    structure: `This sheet has ONE tab: "Transfer Destinations". It has 2 columns total (A = Player Name, B = New Team). Row 1 is the protected header row. Column A (Player Name) is PRE-FILLED with outgoing transfers and PROTECTED — do NOT output column A. Column B is the only editable column — a STRICT dropdown of team names.

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Output ONLY column B. NEVER output column A, the header row, or any commentary.
2. Output format is a SINGLE column of values — one value per line — NO tabs, NO extra columns.
3. Row order must match the pre-filled Player Name rows EXACTLY from top to bottom as shown in the screenshot. If the sheet shows N pre-filled players, output EXACTLY N lines (even if some are blank).
4. Every non-blank value MUST be a team name from the TEAM NAMES list provided at the bottom of this prompt. Examples: Alabama, Ohio State, Georgia, Texas.
5. NEVER use full team names ("Alabama"), nicknames ("Crimson Tide"), mascots ("Tide"), city names, or conference names. The column is a STRICT dropdown — wrong spelling / wrong casing / free text will be silently rejected.
6. Team names must match the TEAM NAMES list below exactly.
7. BLANK LINE if the destination is unknown — leave the line empty (an empty string between two newlines). Do NOT guess, NOT use "UNK", "N/A", "TBD", or "-".
8. No header row, no commentary or explanation INSIDE the data, no totals.
9. If the screenshot shows the player has withdrawn / is no longer transferring, leave that line blank.

═══════════════════════════════════════════════════════════
SECTION: "Transfer Destinations"
═══════════════════════════════════════════════════════════

Column layout:

Col | Header (row 1, protected) | Pre-filled / protected?          | Your value
----+---------------------------+----------------------------------+-----------------------------------
 A  | Player Name               | Pre-filled (outgoing transfers) — PROTECTED | DO NOT OUTPUT
 B  | New Team                  | Empty — EDITABLE dropdown        | Team name from mapping (or BLANK)

───────────────────────────────────────────────────────────
COLUMN B — New Team — Allowed values:
Any team name from the TEAM NAMES list provided at the bottom of this prompt. Use the team name exactly as shown (e.g. Alabama, Ohio State, Miami (FL), Miami (OH)).

Leave the line BLANK if the destination is not visible/known in the screenshots — a blank is the correct answer for unknown.

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== TRANSFER DESTINATIONS ===
<team name or blank>
<team name or blank>
<team name or blank>
…one line per pre-filled player, in the EXACT order shown in the screenshots

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Exactly N lines, where N = number of pre-filled Player Name rows visible in the screenshots
[ ] Every non-blank value is an exact team name in the TEAM NAMES list (case-sensitive)
[ ] No full team names, nicknames, mascots, cities, conferences
[ ] No tabs, no commas, no other columns
[ ] Blank lines used for unknown destinations — nothing invented, no "UNK"/"N/A"/"TBD"
[ ] No header row, no commentary INSIDE the data, no totals`,
    includeTeamMap: true,
    dynastyTeams: currentDynasty?.teams,
  }), [currentYear, userRoster, currentDynasty?.teams])

  // LOCAL-PASTE prompt: self-describing rows, no pre-filled column to align
  // against. The AI emits one line per transferring player whose destination
  // it can see, as PlayerName<TAB>NewTeam — so a paste carries its own
  // identity and the parser/save match by name (omitted players are unchanged).
  const localAiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} Transfer Destinations`,
    roster: userRoster,
    structure: `Output ONE line per outgoing transfer whose NEW TEAM you can see in the screenshots. Each line is SELF-DESCRIBING — it carries the player's own name, so there is NO pre-filled column to line up against and NO fixed row order.

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Each line has EXACTLY 2 tab-separated fields: PlayerName<TAB>NewTeam.
2. NO header row. NO blank lines. NO commentary, totals, or labels INSIDE the data.
3. OMIT any player whose destination you cannot see — do NOT pad with blank lines, do NOT guess, do NOT write "UNK"/"N/A"/"TBD". A player with no known destination simply has no line.
4. Output ONE line PER PLAYER who has a known new team. The order does not matter.
5. PlayerName: the full player name exactly as it should appear (use the roster block below to expand abbreviated names like "A. Guess").
6. NewTeam: a team name from the TEAM NAMES list at the bottom (e.g. Alabama, Ohio State, Georgia, Miami (OH)). NEVER an abbreviation, nickname, mascot, city, or conference. Match the team name exactly as written in the list.
7. If the screenshot shows a player withdrew / is no longer transferring, OMIT them entirely.

═══════════════════════════════════════════════════════════
PER-LINE OUTPUT (2 tab-separated fields)
═══════════════════════════════════════════════════════════
<Player Name><TAB><New Team Abbr>

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== TRANSFER DESTINATIONS ===
<Player Name>\\t<New Team Abbr>
<Player Name>\\t<New Team Abbr>
…one line per transfer with a known destination; omit unknowns entirely

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Every line has exactly 2 tab-separated fields (one tab)
[ ] Every New Team value is an exact name from the list (case-sensitive)
[ ] No full team names, nicknames, mascots, cities, conferences
[ ] No blank lines, no header row, no commentary INSIDE the data
[ ] Only players whose destination is visible — nothing invented, no "UNK"/"N/A"/"TBD"`,
    includeTeamMap: true,
    dynastyTeams: currentDynasty?.teams,
  }), [currentYear, userRoster, currentDynasty?.teams])

  // Ref to prevent concurrent sheet creation (state updates are async, refs are immediate)
  const creatingSheetRef = useRef(false)
  // Single-attempt guard: a FAILED creation must not silently re-fire (the
  // runaway loop that spam-created sheets). One attempt per modal-open; an
  // explicit retry bumps auth.retryCount and re-arms exactly one more.
  const creationAttemptedRef = useRef(false)
  const lastRetryCountRef = useRef(auth.retryCount)

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

  // Get transferring players (those leaving via transfer - NOT graduating or pro draft)
  // Reads from BOTH playersLeavingByYear AND player.leavingYear/leavingReason
  const getTransferringPlayers = () => {
    const playersLeavingThisYear = currentDynasty?.playersLeavingByYear?.[currentYear] || []
    const nonTransferReasons = ['Graduating', 'Pro Draft']

    // Source 1: Players from playersLeavingByYear
    const transfersFromList = playersLeavingThisYear
      .filter(p => p.reason && !nonTransferReasons.includes(p.reason))
      .map(leaving => {
        const player = (currentDynasty?.players || []).find(p => p.name === leaving.playerName || p.pid === leaving.pid)
        return {
          name: leaving.playerName,
          pid: leaving.pid || player?.pid,
          position: player?.position || ''
        }
      })

    // Source 2: Players with leavingYear set on their player record
    const transfersFromPlayerRecord = (currentDynasty?.players || [])
      .filter(p =>
        p.leavingYear === currentYear &&
        p.leavingReason &&
        !nonTransferReasons.includes(p.leavingReason)
      )
      .map(player => ({
        name: player.name,
        pid: player.pid,
        position: player.position || ''
      }))

    // Combine both sources
    const allTransfers = [...transfersFromList, ...transfersFromPlayerRecord]

    // Deduplicate by player name (in case same player appears in both sources)
    const seen = new Set()
    return allTransfers.filter(p => {
      if (seen.has(p.name)) return false
      seen.add(p.name)
      return true
    })
  }

  // Create sheet when modal opens (only if no existing sheet for this season)
  useEffect(() => {
    // An explicit retry re-arms one fresh attempt by bumping auth.retryCount.
    if (auth.retryCount !== lastRetryCountRef.current) {
      lastRetryCountRef.current = auth.retryCount
      creationAttemptedRef.current = false
    }

    const createSheet = async () => {
      // Don't create a Google Sheet while the local paste path is active.
      if (isOpen && !useLocal && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote && !noTransfers && !creationAttemptedRef.current) {
        // Mark attempted BEFORE any await so a rejection can't loop back in
        creationAttemptedRef.current = true
        // Set ref immediately to prevent concurrent calls (state updates are async)
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          // Check if dynasty already has a sheet for this season (avoid race with restore effect)
          if (
            currentDynasty?.transferDestinationsSheetId &&
            currentDynasty?.transferDestinationsSheetYear === currentYear
          ) {
            const stillExists = await sheetExists(currentDynasty.transferDestinationsSheetId)
            if (stillExists) {
              setSheetId(currentDynasty.transferDestinationsSheetId)
              return
            }
            await updateDynasty(currentDynasty.id, {
              transferDestinationsSheetId: null,
              transferDestinationsSheetYear: null
            })
            // stale sheet (trashed in Drive); fall through to regenerate
          }

          const transferringPlayers = getTransferringPlayers()

          if (transferringPlayers.length === 0) {
            setNoTransfers(true)
            return
          }

          const sheetInfo = await createTransferDestinationsSheet(
            currentDynasty?.teamName || 'Dynasty',
            currentYear,
            transferringPlayers,
            currentDynasty?.teams || currentDynasty?.customTeams
          )
          setSheetId(sheetInfo.spreadsheetId)

          // Save sheet ID and year to dynasty so we can reuse it
          await updateDynasty(currentDynasty.id, {
            transferDestinationsSheetId: sheetInfo.spreadsheetId,
            transferDestinationsSheetYear: currentYear
          })
        } catch (error) {
          console.error('Failed to create transfer destinations sheet:', error)
          if (!auth.handleError(error)) toast.error(auth.describeError(error, 'create the sheet'))
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }

    createSheet()
  }, [isOpen, useLocal, user, sheetId, currentDynasty?.id, auth.retryCount, showDeletedNote, noTransfers, currentYear])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowDeletedNote(false)
      setNoTransfers(false)
      creatingSheetRef.current = false
      creationAttemptedRef.current = false
      setUseLocal(true)
    }
  }, [isOpen])

  // Restore sheetId from dynasty when modal re-opens (e.g. after app reload).
  // Skipped while the local paste path is active so it can't pull in a Google sheet.
  useEffect(() => {
    if (isOpen && !useLocal && !sheetId && !creatingSheet && !creatingSheetRef.current) {
      if (
        currentDynasty?.transferDestinationsSheetId &&
        currentDynasty?.transferDestinationsSheetYear === currentYear
      ) {
        const candidateId = currentDynasty.transferDestinationsSheetId
        ;(async () => {
          const stillExists = await sheetExists(candidateId)
          if (stillExists) {
            setSheetId(candidateId)
            return
          }
          await updateDynasty(currentDynasty.id, {
            transferDestinationsSheetId: null,
            transferDestinationsSheetYear: null
          })
          // stale sheet (trashed in Drive); fall through to regenerate
        })()
      }
    }
  }, [isOpen, useLocal])

  // Local paste import: the AI emits PlayerName<TAB>NewTeam rows — exactly the
  // two columns the parser reads as row[0]/row[1], so the split rows map
  // straight through. Downstream save matches by player name, so omitting
  // players with unknown destinations leaves them unchanged.
  const handleLocalImport = async (text) => {
    const destinations = await readTransferDestinationsFromSheet(null, (currentDynasty?.teams || currentDynasty?.customTeams), { rows: splitTsv(text) })
    await onSave(destinations)
    onClose()
  }

  const handleSyncFromSheet = async () => {
    if (!sheetId) return

    setSyncing(true)
    try {
      const destinations = await readTransferDestinationsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(destinations)
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
      const destinations = await readTransferDestinationsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(destinations)

      // Move sheet to trash and clear saved reference
      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, {
        transferDestinationsSheetId: null,
        transferDestinationsSheetYear: null
      })

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
      await updateDynasty(currentDynasty.id, {
        transferDestinationsSheetId: null,
        transferDestinationsSheetYear: null
      })
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
      title: 'Delete this transfer destinations sheet?',
      message: 'This deletes the Google Sheet without applying any edits. Your dynasty transfer data stays as-is.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    setDeletingSheet(true)
    try {
      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, {
        transferDestinationsSheetId: null,
        transferDestinationsSheetYear: null
      })
      setSheetId(null)
      setShowDeletedNote(true)
      setTimeout(() => onClose(), 1800)
    } catch (error) {
      console.error('Failed to delete sheet:', error)
      if (!auth.handleError(error)) {
        toast.error('Failed to delete the sheet. Try again.')
      }
    } finally {
      setDeletingSheet(false)
    }
  }

  const handleClose = () => {
    onClose()
  }

  const handleSkip = async () => {
    // No transfers, just save empty results and close
    await onSave([])
    onClose()
  }

  if (!isOpen) return null

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'Transfer Destinations') : null
  const isLoading = creatingSheet
  const transferringPlayers = getTransferringPlayers()
  const transferCount = transferringPlayers.length

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
        <SheetModalHeader eyebrow="Transfer Portal" title="Transfer Destinations" onClose={handleClose} />

        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">
        {noTransfers ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 text-center max-w-sm">
              <p className="label-xs text-txt-tertiary mb-2">Status</p>
              <p className="text-xl font-bold text-txt-primary mb-2">No Outgoing Transfers</p>
              <p className="text-sm mb-6 text-txt-secondary">
                No players transferred out this year.
              </p>
              <button
                onClick={handleSkip}
                className="px-6 py-3 rounded-lg font-semibold hover:opacity-90"
                style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}
              >
                Continue
              </button>
            </div>
          </div>
        ) : useLocal && !showDeletedNote ? (
          <LocalDataEntry
            aiPrompt={localAiPrompt}
            onImport={handleLocalImport}
            onUseGoogle={() => setUseLocal(false)}
            onCancel={handleClose}
            importLabel="Import Transfer Destinations"
            columns={['Player', 'New Team']}
            comboboxColumns={{ 'New Team': teamAbbrs }}
            comboboxAliases={getTeamNameAliases(currentDynasty?.teams)}
            initialText={initialText}
          />
        ) : isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div
                className="animate-spin w-12 h-12 border-4 rounded-full mx-auto mb-4"
                style={{
                  borderColor: 'var(--text-primary)',
                  borderTopColor: 'transparent'
                }}
              />
              <p className="text-lg font-semibold text-txt-primary">
                Creating Transfer Destinations Sheet...
              </p>
              <p className="text-sm mt-2 text-txt-secondary">
                Pre-filling {transferCount} outgoing transfer{transferCount !== 1 ? 's' : ''}
              </p>
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 text-center max-w-sm">
              <p className="label-xs text-txt-tertiary mb-2">Status</p>
              <p className="text-xl font-bold text-txt-primary mb-2">Saved &amp; Moved to Trash</p>
              <p className="text-sm text-txt-secondary">Transfer destinations saved. Player profiles updated.</p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden gap-3">
            <SheetModalAIHero
              tagline="Skip the typing. Let AI fill the transfer destinations."
              buttons={[{ label: 'Copy AI Prompt', prompt: aiPrompt }]}
            />
            {isMobile || !useEmbedded ? (
              <SheetManualEntry sheetId={sheetId} />
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0 border border-surface-4 rounded-lg">
                <iframe
                  src={embedUrl}
                  className="w-full h-full"
                  title="Transfer Destinations Sheet"
                />
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
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-txt-primary">Failed to create sheet. Please try again.</p>
          </div>
        )}
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
