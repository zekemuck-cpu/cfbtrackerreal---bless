import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty, isPlayerOnRoster } from '../context/DynastyContext'
import { getCurrentTeamTid } from '../data/teamRegistry'
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
  createFringeCaseClassSheet,
  readFringeCaseClassFromSheet,
  deleteGoogleSheet,
  getSheetEmbedUrl,
  sheetExists
} from '../services/sheetsService'
import { getModalColors } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'
import LocalDataEntry from './ui/LocalDataEntry'
import { splitTsv } from '../utils/tsvParse'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function FringeCaseClassModal({ isOpen, onClose, onSave, currentYear, teamColors, fringeCasePlayers }) {
  const { currentDynasty, updateDynasty } = useDynasty()
  const { user } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [creatingSheet, setCreatingSheet] = useState(false)
  const [sheetId, setSheetId] = useState(null)
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

  const userRoster = useMemo(() => {
    // Filter by TID + pass dynasty so teambuilder-renamed teams resolve.
    // Abbr-only call without dynasty silently fails for teambuilder.
    const teamTid = getCurrentTeamTid(currentDynasty)
    const teamAbbrForRoster =
      currentDynasty?.teams?.[currentDynasty?.currentTid]?.abbr ||
      currentDynasty?.teamName
    const all = currentDynasty?.players || []
    return all
      .filter(p => isPlayerOnRoster(p, teamTid ?? teamAbbrForRoster, currentYear, currentDynasty))
      .map(p => ({ name: p.name, jerseyNumber: p.jerseyNumber, position: p.position }))
  }, [currentDynasty?.players, currentDynasty?.teams, currentDynasty?.currentTid, currentDynasty?.teamName, currentYear, currentDynasty])

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} Fringe Case Class Assignment`,
    roster: userRoster,
    structure: `This sheet has ONE tab: "Fringe Cases". It has 5 columns total: A = Player, B = Position, C = "${currentYear} Recruitment Class", D = Games, E = "Updated ${currentYear + 1} Class". Row 1 is the protected header row. Columns A, B, C, D are PRE-FILLED from dynasty data and PROTECTED — do NOT output them. Column E is the only editable column, and its allowed dropdown values are PER-ROW (they depend on that row's Column C value).

These are "fringe case" players who played between 5 and 9 games in ${currentYear}. Depending on the game's redshirt logic, each player can either be progressed to the next class OR kept at the current class with the RS prefix applied (i.e. a redshirt was used). Your job is to pick one of the two allowed values for each row.

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Output ONLY column E. NEVER output columns A, B, C, D, or the header row.
2. Output format is a SINGLE column of values — one value per line — NO tabs, NO extra columns.
3. Row order must match the pre-filled player rows EXACTLY from top to bottom as shown in the screenshot. If the sheet shows N pre-filled players, output EXACTLY N lines (blank lines only when the current class is "RS Sr" which has no progression).
4. Each row's allowed dropdown values are STRICTLY determined by that row's Column C value (the player's ${currentYear} class). You MUST pick one of the allowed values for that row — any other value is rejected by the dropdown.
5. Use the EXACT literal strings shown below. "RS Fr" with ONE space. No "Fr (RS)", no "RSFr", no "Rs Fr", no "RS-Fr", no "Fr*".
6. No header row, no commentary or explanation INSIDE the data, no totals.
7. NEVER output a class that isn't in that row's allowed set.

═══════════════════════════════════════════════════════════
SECTION: "Fringe Cases"
═══════════════════════════════════════════════════════════

Column layout:

Col | Header (row 1, protected)               | Pre-filled / protected?           | Your value
----+-----------------------------------------+-----------------------------------+-----------------------------------
 A  | Player                                  | Pre-filled — PROTECTED            | DO NOT OUTPUT
 B  | Position                                | Pre-filled — PROTECTED            | DO NOT OUTPUT
 C  | ${currentYear} Recruitment Class                    | Pre-filled — PROTECTED            | DO NOT OUTPUT
 D  | Games                                   | Pre-filled — PROTECTED            | DO NOT OUTPUT
 E  | Updated ${currentYear + 1} Class                        | Empty — EDITABLE dropdown (per-row) | Exactly one allowed value, or BLANK only for "RS Sr"

───────────────────────────────────────────────────────────
COLUMN E — Per-row allowed values (depends on the row's Column C "${currentYear} Recruitment Class"):

If Column C = "Fr"     → allowed values: "So" | "RS Fr"
If Column C = "So"     → allowed values: "Jr" | "RS So"
If Column C = "Jr"     → allowed values: "Sr" | "RS Jr"
If Column C = "Sr"     → allowed value:  "RS Sr"                  (only one option)
If Column C = "RS Fr"  → allowed value:  "RS So"                  (only one option)
If Column C = "RS So"  → allowed value:  "RS Jr"                  (only one option)
If Column C = "RS Jr"  → allowed value:  "RS Sr"                  (only one option)
If Column C = "RS Sr"  → NO OPTIONS — leave the line blank (player graduates; no progression possible)

Selection guidance (when two options exist):
- Pick the NON-RS progressed class (e.g. "So", "Jr", "Sr") if the player did NOT use a redshirt in ${currentYear} — i.e. the screenshot indicates a normal year of eligibility was used. The fringe-case range is 5–9 games, so progression without redshirt is common.
- Pick the "RS <CurrentClass>" value (e.g. "RS Fr", "RS So", "RS Jr") if the player used a redshirt in ${currentYear} — the screenshot / context indicates a redshirt was applied (e.g. the player participated in fewer meaningful games, or redshirt status is explicit).
- When only one option is allowed (Sr, RS Fr, RS So, RS Jr), output that single value.
- LITERAL case matters: all of "Fr", "So", "Jr", "Sr", "RS Fr", "RS So", "RS Jr", "RS Sr" use Title Case with "RS" uppercase and exactly one space before the class letters.

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== FRINGE CASES ===
<allowed value or blank>
<allowed value or blank>
<allowed value or blank>
…one line per pre-filled player, in the EXACT order shown in the screenshots

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Exactly N lines, where N = number of pre-filled player rows visible in the screenshots
[ ] Every non-blank line is one of that row's allowed values based on Column C (per the table above)
[ ] No "Fr (RS)" / "So (RS)" / "Jr (RS)" — use the "RS Fr" / "RS So" / "RS Jr" forms only
[ ] Exact casing: "Fr", "So", "Jr", "Sr", "RS Fr", "RS So", "RS Jr", "RS Sr" (single space, "RS" uppercase)
[ ] No tabs, no extra columns, no commentary INSIDE the data
[ ] Blank line ONLY for rows where Column C = "RS Sr" (no progression)
[ ] No header row, no totals`,
    includeTeamMap: true,
    dynastyTeams: currentDynasty?.teams,
    notes: `The "Games" column (protected) reflects regular-season games played in ${currentYear}. In the fringe-case context, the game decides whether a redshirt was applied (typically ≤ 4 games used a redshirt; 5–9 games is the fringe case where either progression or redshirt may apply). Use the screenshot's Games and context to pick the correct allowed value for each row.`
  }), [currentYear, userRoster, currentDynasty?.teams])

  // Pre-fill the local grid with any class selections already saved for this
  // year so re-opening the modal shows prior picks instead of a blank grid.
  // Source: fringeCaseClassByYear[currentYear] (the exact array
  // handleFringeCaseClassSave persisted). Column order mirrors the local parser
  // (Player, New Class): serialize playerName + selectedClass.
  const initialText = useMemo(() => {
    const saved = currentDynasty?.fringeCaseClassByYear?.[currentYear] || []
    return saved
      .filter(s => s.playerName && s.selectedClass)
      .map(s => `${s.playerName}\t${s.selectedClass}`)
      .join('\n')
  }, [currentDynasty?.fringeCaseClassByYear, currentYear])

  // LOCAL-PASTE prompt: self-describing rows, no pre-filled column to align
  // against. The AI emits ONE line per fringe-case player who gets a new class,
  // as PlayerName<TAB>NewClass — so a paste carries its own identity and the
  // save matches by name (omitted players are unchanged).
  const localAiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} Fringe Case Class Assignment`,
    roster: userRoster,
    structure: `Output ONE line per fringe-case player whose updated ${currentYear + 1} class you are setting. Each line is SELF-DESCRIBING — it carries the player's own name — so there is NO pre-filled column to line up against and NO fixed row order.

These are players who played between 5 and 9 games in ${currentYear}. Depending on the redshirt logic, each player either PROGRESSES to the next class (e.g. "So", "Jr", "Sr") OR is kept at their current class with an "RS" prefix applied (a redshirt was used, e.g. "RS Fr", "RS So", "RS Jr").

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Each line has EXACTLY 2 tab-separated fields: PlayerName<TAB>NewClass.
2. NO header row. NO blank lines. NO commentary, totals, or labels INSIDE the data.
3. OMIT any player whose updated class you cannot determine, and OMIT any player at "RS Sr" (they graduate — no progression). A player with no line is left unchanged. Do NOT pad with blank lines.
4. The order does not matter — each line stands on its own.
5. PlayerName: the full player name exactly as it should appear (use the roster block below to expand abbreviated names like "A. Guess").
6. NewClass MUST be one of these EXACT literal strings: Fr | So | Jr | Sr | RS Fr | RS So | RS Jr | RS Sr — Title Case, "RS" uppercase, exactly one space. No "Fr (RS)", no "RSFr", no "Rs Fr", no "RS-Fr".
7. Pick the progressed class (So / Jr / Sr) when the player did NOT redshirt in ${currentYear}; pick the "RS <current class>" form when a redshirt WAS used.

═══════════════════════════════════════════════════════════
PER-LINE OUTPUT (2 tab-separated fields)
═══════════════════════════════════════════════════════════
<Player Name><TAB><New Class>

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== FRINGE CASES ===
<Player Name>\\t<New Class>
<Player Name>\\t<New Class>
…one line per player who progresses; omit RS Sr / unknown entirely

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Every line has exactly 2 tab-separated fields (one tab)
[ ] Every New Class value is one of: Fr, So, Jr, Sr, RS Fr, RS So, RS Jr, RS Sr (exact casing, single space)
[ ] No blank lines, no header row, no commentary INSIDE the data
[ ] RS Sr players and unknowns are omitted — nothing invented`,
    includeTeamMap: false,
    notes: `In the fringe-case context, the game decides whether a redshirt was applied (typically ≤ 4 games used a redshirt; 5–9 games is the fringe case where either progression or redshirt may apply). Use the screenshot's Games and context to pick the correct class for each player.`
  }), [currentYear, userRoster])

  // Ref to prevent concurrent sheet creation (state updates are async, refs are immediate)
  const creatingSheetRef = useRef(false)
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

  // Create fringe case class sheet when modal opens
  useEffect(() => {
    if (auth.retryCount !== lastRetryCountRef.current) {
      lastRetryCountRef.current = auth.retryCount
      creationAttemptedRef.current = false
    }

    const createSheet = async () => {
      // Don't create a Google Sheet while the local paste path is active.
      if (isOpen && !useLocal && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote && !creationAttemptedRef.current) {
        creationAttemptedRef.current = true
        // Set ref immediately to prevent concurrent calls (state updates are async)
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          // Check if we have an existing sheet for this year
          const existingSheetId = currentDynasty?.fringeCaseClassSheetId
          if (existingSheetId) {
            const stillExists = await sheetExists(existingSheetId)
            if (stillExists) {
              setSheetId(existingSheetId)
              return
            }
            await updateDynasty(currentDynasty.id, { fringeCaseClassSheetId: null })
            // stale sheet (trashed in Drive); fall through to regenerate
          }

          const sheetInfo = await createFringeCaseClassSheet(
            currentDynasty?.teamName || 'Dynasty',
            currentYear,
            fringeCasePlayers || []
          )
          setSheetId(sheetInfo.spreadsheetId)

          // Save sheet ID to dynasty
          await updateDynasty(currentDynasty.id, {
            fringeCaseClassSheetId: sheetInfo.spreadsheetId
          })
        } catch (error) {
          console.error('Failed to create fringe case class sheet:', error)
          auth.handleError(error)
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }

    createSheet()
  }, [isOpen, useLocal, user, sheetId, currentDynasty?.id, auth.retryCount, showDeletedNote, fringeCasePlayers, currentYear])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowDeletedNote(false)
      creatingSheetRef.current = false
      creationAttemptedRef.current = false
      setUseLocal(true)
    }
  }, [isOpen])

  // Local paste import: the AI emits PlayerName<TAB>NewClass rows. The parser
  // reads name=row[0] and the new class=row[4], so reshape each pasted
  // [name, class] pair into the parser's 5-column layout. Downstream save
  // matches by name, so omitting unchanged players is correct.
  const handleLocalImport = async (text) => {
    const rows = splitTsv(text).map(c => [c[0], '', '', '', (c[1] ?? '')])
    const classSelections = await readFringeCaseClassFromSheet(null, (currentDynasty?.teams || currentDynasty?.customTeams), { rows })
    await onSave(classSelections)
    onClose()
  }

  const handleSyncFromSheet = async () => {
    if (!sheetId) return

    setSyncing(true)
    try {
      const classSelections = await readFringeCaseClassFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(classSelections)
      onClose()
    } catch (error) {
      console.error(error)
      if (!auth.handleError(error)) {
        toast.error('Failed to sync from Google Sheets. Make sure all players have a class selected.')
      }
    } finally {
      setSyncing(false)
    }
  }

  const handleSyncAndDelete = async () => {
    if (!sheetId) return

    setDeletingSheet(true)
    try {
      const classSelections = await readFringeCaseClassFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(classSelections)

      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { fringeCaseClassSheetId: null })

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
      await updateDynasty(currentDynasty.id, { fringeCaseClassSheetId: null })
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
      title: 'Delete this fringe case class sheet?',
      message: 'This deletes the Google Sheet without applying any edits. Your dynasty player class assignments stay as-is.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    setDeletingSheet(true)
    try {
      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { fringeCaseClassSheetId: null })
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

  if (!isOpen) return null

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'Fringe Cases') : null
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
        <SheetModalHeader eyebrow="Offseason" title="Fringe Case Class Assignment" onClose={handleClose} />
        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">

        {useLocal && !showDeletedNote ? (
          <LocalDataEntry
            aiPrompt={localAiPrompt}
            columns={['Player', 'New Class']}
            onImport={handleLocalImport}
            onUseGoogle={() => setUseLocal(false)}
            onCancel={handleClose}
            importLabel="Import Fringe Case Classes"
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
              <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                Creating Fringe Case Class Sheet...
              </p>
              <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
                Players with 5-9 games who might have redshirted
              </p>
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center p-8 rounded-lg" style={{ backgroundColor: 'var(--text-primary)' }}>
              <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke={modalColors.background} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-xl font-bold mb-2" style={{ color: modalColors.background }}>
                Saved & Moved to Trash!
              </p>
              <p className="text-sm" style={{ color: modalColors.background, opacity: 0.9 }}>
                Fringe case classes have been assigned.
              </p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden gap-3">
            <SheetModalAIHero
              tagline="Skip the typing. Let AI fill the fringe-case class."
              buttons={[{ label: 'Copy AI Prompt', prompt: aiPrompt }]}
            />
            {isMobile || !useEmbedded ? (
              <SheetManualEntry sheetId={sheetId} />
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0 border border-surface-4 rounded-lg">
                <iframe
                  src={embedUrl}
                  className="w-full h-full"
                  title="Fringe Case Class Sheet"
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
            <p style={{ color: 'var(--text-primary)' }}>Failed to create sheet. Please try again.</p>
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
