import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty } from '../context/DynastyContext'
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
  createTrainingResultsSheet,
  readTrainingResultsFromSheet,
  parseTrainingResultsLocal,
  deleteGoogleSheet,
  getSheetEmbedUrl,
  sheetExists
} from '../services/sheetsService'
import { getModalColors } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
import { buildAttributesStructure } from '../utils/attributeEntry'
import { arePlayerAttributesEnabled } from '../editions'
import AttributePasteGrid from './AttributePasteGrid'
import LocalDataEntry from './ui/LocalDataEntry'
import { splitTsv } from '../utils/tsvParse'
import SheetLoadingHint from './SheetLoadingHint'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function TrainingResultsModal({ isOpen, onClose, onSave, onImportAttributes, currentYear, teamColors, players }) {
  const { currentDynasty, updateDynasty } = useDynasty()
  // CFB 27: offer a "Full attributes" entry mode (local paste of the whole
  // rating set) alongside the Overalls-only Google sheet. Gated on the edition
  // attributes feature; defaults to the existing Overalls flow.
  // Full-attribute entry: edition supports it AND ratings aren't hidden via the
  // "Hide all ratings" league preference. When hidden, this flow is Overalls-only.
  const attributesEnabled = arePlayerAttributesEnabled(currentDynasty)
  const [mode, setMode] = useState('overalls') // 'overalls' | 'attributes'
  // Within Overalls mode, local paste is the DEFAULT; Google is the fallback.
  const [useLocal, setUseLocal] = useState(true)
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

  const [useEmbedded, setUseEmbedded] = useState(() => {
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  // Use the EXACT list of players the sheet is built from (passed in via
  // the `players` prop from Dashboard). That list is the combined
  // returning-players + portal-transfers set. Recomputing it here with a
  // simpler filter missed portal transfers, so the AI prompt listed fewer
  // players than the sheet actually contained — causing the AI to skip
  // valid training rows.
  const userRoster = useMemo(() => (
    (players || []).map(p => ({
      name: p.name,
      jerseyNumber: p.jerseyNumber,
      position: p.position,
    }))
  ), [players])

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} Training Results`,
    roster: userRoster,
    structure: `EA CFB TRAINING RESULTS SCREEN — HOW TO READ IT
═══════════════════════════════════════════════════════════
The game shows training results ONE POSITION GROUP at a time (QB, RB, WR, TE,
OL, DL, LB, DB, K/P). The user will provide screenshots from ALL groups.
Scan every screenshot before producing your output.

Each screen's columns (left to right):
  RS | Name | Year | Pos | OVR | [attribute columns: SPD ACC AGI COD STR AWR
                                  + position-specific stats like THP/SAC, CTH/CIT, PBK/PBP]

• RS   — redshirt status toggle. IGNORE.
• Name — ABBREVIATED (e.g. "D.Ware", "Q.Merchant", "G.McManus"). Resolve to
         full name using the roster block below.
• Year — class label (JR, SR RS, FR RS, SO RS, etc.). IGNORE.
• Pos  — position abbreviation.
• OVR  — the player's CURRENT overall AFTER training. This is the NEW OVR.
         It appears alongside a green OVR gain delta, e.g. "83 (+2)".
         New OVR = 83 → Column 4. Past OVR = 83 − 2 = 81 → Column 3.
         If NO delta is visible, delta = 0 → Past OVR = New OVR → Column 3.
• Attribute columns — show format "[value] (+[gain])" e.g. "84 (+1)".
         These are individual attribute gains. IGNORE them for OVR purposes.

CRITICAL: OVR column = NEW (post-training) overall = Column 4.
          OVR delta (the green +N) used to derive Past OVR = Column 3.

═══════════════════════════════════════════════════════════

This sheet has ONE tab: "Training Results". The app matches rows by PLAYER NAME — row order does not matter. Output ALL FOUR columns for every player on the YOUR TEAM ROSTER block below.

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. OUTPUT 4 TAB-SEPARATED COLUMNS per row: Player<TAB>Position<TAB>Past OVR<TAB>New OVR.
2. ONE ROW PER PLAYER in the YOUR TEAM ROSTER block. Include every roster player, even if their OVR is unknown. The roster block has ALREADY been filtered to exclude incoming HS recruits — they do NOT receive training results. If a name appears in EA's training screenshots but is NOT in the YOUR TEAM ROSTER block, DO NOT output a row for them.
3. Column 1 (Player) MUST use the FULL name from the YOUR TEAM ROSTER block — never abbreviated ("A. Guess"). EA CFB screenshots show abbreviated names; match them to full names using the roster.
4. Column 2 (Position) MUST match the roster's position string exactly (QB, HB, WR, TE, LT, LG, C, RG, RT, LEDG, REDG, DT, SAM, MIKE, WILL, CB, FS, SS, K, P).
5. Column 3 (Past OVR) = New OVR − OVR delta. The OVR column in the screenshot shows the post-training overall alongside a green gain. Example: OVR reads "83 (+2)" → New OVR = 83, Past OVR = 83 − 2 = 81. When no delta is shown (player's overall did not change), delta = 0, so Past OVR = New OVR. Leave BLANK only when the player does not appear in any screenshot at all.
6. Column 4 (New OVR) = the OVR number shown in the training results screenshot for this player. Integer 40–99. Leave BLANK only if the player does not appear on any screenshot.
7. NO header row INSIDE the data. NO commentary INSIDE the data. NO blank lines between rows. Each row has exactly 3 tab characters.
8. INTEGERS only in columns C and D. No decimals, no commas, no quotes, no units, no "+/-" signs, no color coding.
9. NEVER GUESS. If a player does not appear in any of the screenshots provided, leave both Column 3 and Column 4 blank for that player.

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT — a single fenced TSV block, no other prose
═══════════════════════════════════════════════════════════
\`\`\`tsv
Alex Guess	QB	87	90
Jaylen Miller	HB	80	82
Devin Hollis	WR	74	76
Marcus Porter	WR
...
\`\`\`

(Column 3 = New OVR − OVR delta; when no delta shown, delta = 0 so Past OVR = New OVR.
 Column 4 blank only if the player does not appear in any screenshot.)

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Row count equals the number of players on YOUR TEAM ROSTER
[ ] Every row has exactly 3 tab characters (4 columns)
[ ] Column 1 names match the FULL names in the roster block (no initials)
[ ] Column 2 positions use canonical abbreviations
[ ] Column 3 (Past OVR): integer 40–99, computed as New OVR − OVR delta (use 0 when no delta shown → Past OVR = New OVR); blank only when player absent from all screenshots
[ ] Column 4 (New OVR): integer 40–99 for every player visible in any screenshot; blank only for players absent from all screenshots
[ ] No header row, no prose INSIDE the data, no commas, no +/- signs
[ ] Output wrapped in a single \`\`\`tsv ... \`\`\` fence`,
    includeTeamMap: false,
  }), [currentYear, userRoster])

  // Pre-fill the local (Overalls) grid with this team's already-saved training
  // results for the year so the modal opens ready to edit. The parser reads
  // row[0]=Player, row[1]=Position, row[2]=Past OVR, row[3]=New OVR and requires
  // a name + a valid New OVR (40–99), so we emit only saved rows that satisfy
  // that. Round-trip safe: re-importing unchanged re-stores the same results.
  const initialText = useMemo(() => {
    const saved = currentDynasty?.trainingResultsByYear?.[currentYear] || []
    return saved
      .filter(r => r?.playerName && Number(r?.newOverall) >= 40 && Number(r?.newOverall) <= 99)
      .map(r => {
        const past = (r.pastOverall != null && r.pastOverall !== '') ? String(r.pastOverall) : ''
        return `${r.playerName}\t${r.position || ''}\t${past}\t${r.newOverall}`
      })
      .join('\n')
  }, [currentDynasty?.trainingResultsByYear, currentYear])

  // Full-attributes prompt — the AI emits each player's complete rating set in
  // one cell, plus Position + OVR. Used by the local paste grid.
  const attributesPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} Training Results — Full Attributes`,
    roster: userRoster,
    structure: buildAttributesStructure('training'),
    includeTeamMap: false,
  }), [currentYear, userRoster])

  // Ref to prevent concurrent sheet creation (state updates are async, refs are immediate)
  const creatingSheetRef = useRef(false)
  // Single-attempt guard: a failed creation must not auto-retry (that loop
  // spam-created sheets). One attempt per modal-open; an explicit retry bumps
  // auth.retryCount, which re-arms exactly one more attempt.
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

  // Create training results sheet when modal opens
  useEffect(() => {
    // An explicit retry (Refresh after re-auth, or Regenerate) re-arms one attempt.
    if (auth.retryCount !== lastRetryCountRef.current) {
      lastRetryCountRef.current = auth.retryCount
      creationAttemptedRef.current = false
    }
    const createSheet = async () => {
      // Don't create a Google Sheet while the local paste path is active.
      if (isOpen && !useLocal && user && mode === 'overalls' && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote && !creationAttemptedRef.current) {
        // Mark attempted before the first await so a failure can't loop back in.
        creationAttemptedRef.current = true
        // Set ref immediately to prevent concurrent calls (state updates are async)
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          // Check if we have an existing sheet for this year
          const existingSheetId = currentDynasty?.trainingResultsSheetId
          if (existingSheetId) {
            const stillExists = await sheetExists(existingSheetId)
            if (stillExists) {
              setSheetId(existingSheetId)
              return
            }
            await updateDynasty(currentDynasty.id, { trainingResultsSheetId: null })
            // stale sheet (trashed in Drive); fall through to regenerate
          }

          const sheetInfo = await createTrainingResultsSheet(
            currentDynasty?.teamName || 'Dynasty',
            currentYear,
            players || []
          )
          setSheetId(sheetInfo.spreadsheetId)

          // Save sheet ID to dynasty
          await updateDynasty(currentDynasty.id, {
            trainingResultsSheetId: sheetInfo.spreadsheetId
          })
        } catch (error) {
          console.error('Failed to create training results sheet:', error)
          if (!auth.handleError(error)) toast.error(auth.describeError(error, 'create the sheet'))
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }

    createSheet()
  }, [isOpen, useLocal, user, mode, sheetId, currentDynasty?.id, auth.retryCount, showDeletedNote, players, currentYear])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowDeletedNote(false)
      creatingSheetRef.current = false
      creationAttemptedRef.current = false
      setUseLocal(true)
    }
  }, [isOpen])

  // Local paste import: the Training Results AI prompt already emits the full
  // self-describing 4-column rows, matched by name — so parseTrainingResultsLocal
  // returns the SAME shape the Google reader does and onSave applies unchanged.
  const handleLocalImport = async (text) => {
    const results = parseTrainingResultsLocal(splitTsv(text))
    await onSave(results)
    onClose()
  }

  const handleSyncFromSheet = async () => {
    if (!sheetId) return

    setSyncing(true)
    try {
      const trainingResults = await readTrainingResultsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(trainingResults)
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
      const trainingResults = await readTrainingResultsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(trainingResults)

      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { trainingResultsSheetId: null })

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
      await updateDynasty(currentDynasty.id, { trainingResultsSheetId: null })
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
      title: 'Delete this training results sheet?',
      message: 'This deletes the Google Sheet without applying any edits. Your dynasty player overalls stay as-is.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    setDeletingSheet(true)
    try {
      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { trainingResultsSheetId: null })
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

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'Training Results') : null
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
        <SheetModalHeader eyebrow="Offseason" title="Training Results" onClose={handleClose} />

        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">
        {attributesEnabled && (
          <div className="mb-3 inline-flex self-start rounded-md border border-surface-5 overflow-hidden text-sm">
            <button
              type="button"
              onClick={() => setMode('overalls')}
              className={`px-3 py-1.5 font-semibold transition-colors ${mode === 'overalls' ? 'bg-surface-3 text-txt-primary' : 'text-txt-secondary hover:bg-surface-2'}`}
            >
              Overalls
            </button>
            <button
              type="button"
              onClick={() => setMode('attributes')}
              className={`px-3 py-1.5 font-semibold transition-colors border-l border-surface-5 ${mode === 'attributes' ? 'bg-surface-3 text-txt-primary' : 'text-txt-secondary hover:bg-surface-2'}`}
            >
              Full Attributes
            </button>
          </div>
        )}
        {mode === 'attributes' ? (
          <AttributePasteGrid
            players={players}
            year={currentYear}
            aiPrompt={attributesPrompt}
            onImport={async (entries) => { await onImportAttributes?.(entries) }}
            onClose={handleClose}
            hint="Paste the AI reply: one line per player — name, position, OVR, then the ratings cell (AWR 88, SPD 90, …)."
          />
        ) : useLocal && !showDeletedNote ? (
          <LocalDataEntry
            aiPrompt={aiPrompt}
            onImport={handleLocalImport}
            onUseGoogle={() => setUseLocal(false)}
            onCancel={handleClose}
            importLabel="Import Training Results"
            columns={['Player', 'Position', 'Past OVR', 'New OVR']}
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
              tagline="Skip the typing. Let AI fill the training results."
              buttons={[{ label: 'Copy AI Prompt', prompt: aiPrompt }]}
            />
            {isMobile || !useEmbedded ? (
              <SheetManualEntry sheetId={sheetId} />
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0 border border-surface-4 rounded-lg">
                <iframe
                  src={embedUrl}
                  className="w-full h-full"
                  title="Training Results Sheet"
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
